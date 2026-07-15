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
            .position(|d| (frequency - d.frequency).abs() <= DECOY_TOLERANCE)
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
