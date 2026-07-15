//! Sweep state machine: turns a stream of cursor frequencies into lock,
//! decoy-hit, and exhaustion events. This is the single source of truth
//! for "what did that sweep do" — the web shell only renders whatever
//! event comes back, it never re-derives game state itself.

use crate::puzzle::Puzzle;

/// Half-width of the real signal's detection window.
pub const LOCK_TOLERANCE: f64 = 0.012;

/// Half-width of a decoy's detection window.
pub const DECOY_TOLERANCE: f64 = 0.015;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Target {
    Signal,
    Decoy(usize),
}

/// The outcome of a single [`Engine::sweep`] call.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SweepEvent {
    /// The cursor is over open noise, or re-crossing something already
    /// resolved (a spent decoy) — nothing new happened.
    None,
    /// The cursor freshly entered a decoy's window; one sweep was spent.
    DecoyHit { index: usize },
    /// The cursor freshly entered the real signal's window: locked for
    /// the rest of the puzzle.
    Locked { frequency: f64 },
    /// The sweep budget was already at zero (or just hit zero) without a
    /// lock; input is no longer accepted.
    Exhausted,
    /// The puzzle is already locked; input is inert.
    Ignored,
}

/// Drives one puzzle's sweep session.
pub struct Engine {
    puzzle: Puzzle,
    sweeps_remaining: u32,
    triggered_decoys: Vec<bool>,
    locked: bool,
    current_target: Option<Target>,
}

impl Engine {
    pub fn new(puzzle: Puzzle) -> Self {
        let decoy_count = puzzle.decoys.len();
        Self {
            sweeps_remaining: puzzle.sweep_budget,
            triggered_decoys: vec![false; decoy_count],
            locked: false,
            current_target: None,
            puzzle,
        }
    }

    /// Processes one cursor position. `frequency` is normalized `[0, 1]`.
    pub fn sweep(&mut self, frequency: f64) -> SweepEvent {
        if self.locked {
            return SweepEvent::Ignored;
        }
        if self.sweeps_remaining == 0 {
            return SweepEvent::Exhausted;
        }

        let target = self.find_target(frequency);
        if target == self.current_target {
            return SweepEvent::None;
        }
        self.current_target = target;

        match target {
            Some(Target::Signal) => {
                self.locked = true;
                SweepEvent::Locked {
                    frequency: self.puzzle.signal.frequency,
                }
            }
            Some(Target::Decoy(index)) => {
                if self.triggered_decoys[index] {
                    return SweepEvent::None;
                }
                self.triggered_decoys[index] = true;
                self.sweeps_remaining -= 1;
                SweepEvent::DecoyHit { index }
            }
            None => SweepEvent::None,
        }
    }

    fn find_target(&self, frequency: f64) -> Option<Target> {
        if (frequency - self.puzzle.signal.frequency).abs() <= LOCK_TOLERANCE {
            return Some(Target::Signal);
        }
        self.puzzle
            .decoys
            .iter()
            .position(|d| (frequency - d.emitter.frequency).abs() <= DECOY_TOLERANCE)
            .map(Target::Decoy)
    }

    pub fn is_locked(&self) -> bool {
        self.locked
    }

    pub fn is_exhausted(&self) -> bool {
        !self.locked && self.sweeps_remaining == 0
    }

    pub fn sweeps_remaining(&self) -> u32 {
        self.sweeps_remaining
    }

    pub fn puzzle(&self) -> &Puzzle {
        &self.puzzle
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::puzzle::{Decoy, Emitter, Property};

    fn emitter(frequency: f64) -> Emitter {
        Emitter {
            frequency,
            duty_cycle: 0.5,
            noise_floor: 0.3,
        }
    }

    fn test_puzzle(signal_freq: f64, decoy_freqs: &[f64], budget: u32) -> Puzzle {
        Puzzle {
            date: "test".to_string(),
            signal: emitter(signal_freq),
            decoys: decoy_freqs
                .iter()
                .map(|&f| Decoy {
                    emitter: emitter(f),
                    mismatch: Property::DutyCycle,
                })
                .collect(),
            sweep_budget: budget,
        }
    }

    #[test]
    fn crossing_a_decoy_costs_one_sweep() {
        let mut engine = Engine::new(test_puzzle(0.5, &[0.2], 1));
        assert_eq!(engine.sweep(0.2), SweepEvent::DecoyHit { index: 0 });
        assert_eq!(engine.sweeps_remaining(), 0);
    }

    #[test]
    fn lingering_on_the_same_decoy_does_not_double_charge() {
        let mut engine = Engine::new(test_puzzle(0.5, &[0.2], 3));
        assert_eq!(engine.sweep(0.2), SweepEvent::DecoyHit { index: 0 });
        assert_eq!(engine.sweep(0.201), SweepEvent::None);
        assert_eq!(engine.sweep(0.199), SweepEvent::None);
        assert_eq!(engine.sweeps_remaining(), 2);
    }

    #[test]
    fn revisiting_a_spent_decoy_after_leaving_is_free() {
        let mut engine = Engine::new(test_puzzle(0.5, &[0.2], 3));
        assert_eq!(engine.sweep(0.2), SweepEvent::DecoyHit { index: 0 });
        assert_eq!(engine.sweep(0.9), SweepEvent::None); // leave into open noise
        assert_eq!(engine.sweep(0.2), SweepEvent::None); // re-enter, already spent
        assert_eq!(engine.sweeps_remaining(), 2);
    }

    #[test]
    fn crossing_the_signal_locks_and_reports_its_exact_frequency() {
        let mut engine = Engine::new(test_puzzle(0.503, &[0.2], 3));
        assert_eq!(engine.sweep(0.503), SweepEvent::Locked { frequency: 0.503 });
        assert!(engine.is_locked());
    }

    #[test]
    fn lock_persists_and_further_sweeps_are_ignored() {
        let mut engine = Engine::new(test_puzzle(0.5, &[0.2], 3));
        engine.sweep(0.5);
        assert!(engine.is_locked());
        assert_eq!(engine.sweep(0.2), SweepEvent::Ignored);
        assert_eq!(engine.sweep(0.9), SweepEvent::Ignored);
        assert!(engine.is_locked());
        assert_eq!(engine.sweeps_remaining(), 3);
    }

    #[test]
    fn budget_exhaustion_without_lock_blocks_further_input() {
        let mut engine = Engine::new(test_puzzle(0.5, &[0.2, 0.4], 1));
        engine.sweep(0.2);
        assert!(engine.is_exhausted());
        assert_eq!(engine.sweep(0.4), SweepEvent::Exhausted);
        // even sweeping straight across the real signal no longer wins
        assert_eq!(engine.sweep(0.5), SweepEvent::Exhausted);
        assert!(!engine.is_locked());
    }

    #[test]
    fn frequency_just_inside_tolerance_hits_just_outside_misses() {
        let mut engine = Engine::new(test_puzzle(0.5, &[], 3));
        let just_inside = 0.5 + LOCK_TOLERANCE - 1e-9;
        assert_eq!(
            engine.sweep(just_inside),
            SweepEvent::Locked { frequency: 0.5 }
        );

        let mut engine = Engine::new(test_puzzle(0.5, &[], 3));
        let just_outside = 0.5 + LOCK_TOLERANCE + 1e-9;
        assert_eq!(engine.sweep(just_outside), SweepEvent::None);
    }

    #[test]
    fn frequency_exactly_at_tolerance_boundary_hits() {
        // Distance exactly equal to LOCK_TOLERANCE must still lock — the
        // window is inclusive (`<=`), not exclusive (`<`). Signal sits at
        // 0.0 so `(frequency - signal).abs()` is `frequency` itself with
        // no intervening rounding from an add-then-subtract round trip.
        let mut engine = Engine::new(test_puzzle(0.0, &[], 3));
        assert_eq!(
            engine.sweep(LOCK_TOLERANCE),
            SweepEvent::Locked { frequency: 0.0 }
        );
    }

    #[test]
    fn puzzle_with_no_decoys_never_drains_budget_on_open_noise() {
        let mut engine = Engine::new(test_puzzle(0.5, &[], 4));
        for f in [0.1, 0.15, 0.2, 0.9] {
            assert_eq!(engine.sweep(f), SweepEvent::None);
        }
        assert_eq!(engine.sweeps_remaining(), 4);
        assert!(!engine.is_exhausted());
    }
}
