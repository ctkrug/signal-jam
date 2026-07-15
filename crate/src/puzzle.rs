//! Deterministic daily puzzle generation.
//!
//! A [`Puzzle`] is fully derived from a UTC date string: the hidden signal,
//! the decoy emitters, and the sweep budget. Nothing here touches
//! rendering or DOM state, so it is testable and reusable independent of
//! the wasm boundary.

use crate::rng::Rng;

/// Number of decoy emitters placed alongside the real signal.
pub const DECOY_COUNT: usize = 5;

/// Frequencies are normalized to `[0.0, 1.0]` across the visible band;
/// emitters keep a margin from both edges so they're never clipped by the
/// waterfall bezel.
pub const MIN_FREQUENCY: f64 = 0.08;
pub const MAX_FREQUENCY: f64 = 0.92;

/// Minimum frequency separation enforced between any two emitters
/// (signal or decoy) so their detection windows never overlap.
pub const MIN_SPACING: f64 = 0.07;

/// A single detectable emitter on the band: the real signal and every
/// decoy share this shape.
#[derive(Debug, Clone, PartialEq)]
pub struct Emitter {
    pub frequency: f64,
    pub duty_cycle: f64,
    pub noise_floor: f64,
}

/// A fully generated daily puzzle.
#[derive(Debug, Clone, PartialEq)]
pub struct Puzzle {
    pub date: String,
    pub signal: Emitter,
    pub decoys: Vec<Emitter>,
    /// Sweeps allowed before a loss. Deliberately fewer than `decoys.len()`
    /// so hitting every decoy is a reachable, losable outcome rather than a
    /// budget the player can never exhaust.
    pub sweep_budget: u32,
}

impl Puzzle {
    /// Generates the puzzle for `date` (e.g. `"2026-07-15"`). Deterministic:
    /// the same date string always yields an identical puzzle.
    pub fn generate(date: &str) -> Self {
        let mut rng = Rng::from_seed_str(date);
        let mut placed: Vec<f64> = Vec::with_capacity(DECOY_COUNT + 1);

        let signal_frequency = place_frequency(&mut rng, &placed);
        placed.push(signal_frequency);
        let signal = random_emitter(&mut rng, signal_frequency);

        let mut decoys = Vec::with_capacity(DECOY_COUNT);
        for _ in 0..DECOY_COUNT {
            let frequency = place_frequency(&mut rng, &placed);
            placed.push(frequency);
            decoys.push(random_emitter(&mut rng, frequency));
        }

        Puzzle {
            date: date.to_string(),
            signal,
            decoys,
            sweep_budget: DECOY_COUNT as u32 - 1,
        }
    }
}

fn random_emitter(rng: &mut Rng, frequency: f64) -> Emitter {
    Emitter {
        frequency,
        duty_cycle: rng.next_range(0.2, 0.9),
        noise_floor: rng.next_range(0.1, 0.6),
    }
}

/// Draws a frequency inside the allowed band that stays at least
/// [`MIN_SPACING`] away from every already-placed frequency. Retries a
/// bounded number of times; if the band is saturated it gives up and
/// returns the last candidate rather than looping forever.
fn place_frequency(rng: &mut Rng, existing: &[f64]) -> f64 {
    let mut candidate = rng.next_range(MIN_FREQUENCY, MAX_FREQUENCY);
    for _ in 0..64 {
        if existing
            .iter()
            .all(|f| (f - candidate).abs() >= MIN_SPACING)
        {
            return candidate;
        }
        candidate = rng.next_range(MIN_FREQUENCY, MAX_FREQUENCY);
    }
    candidate
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_emitters(puzzle: &Puzzle) -> Vec<&Emitter> {
        let mut all = vec![&puzzle.signal];
        all.extend(puzzle.decoys.iter());
        all
    }

    #[test]
    fn same_date_produces_identical_puzzle() {
        let a = Puzzle::generate("2026-07-15");
        let b = Puzzle::generate("2026-07-15");
        assert_eq!(a, b);
    }

    #[test]
    fn puzzle_has_expected_decoy_count_and_budget() {
        let puzzle = Puzzle::generate("2026-07-15");
        assert_eq!(puzzle.decoys.len(), DECOY_COUNT);
        assert_eq!(puzzle.sweep_budget, DECOY_COUNT as u32 - 1);
    }

    #[test]
    fn most_consecutive_dates_produce_different_signal_frequencies() {
        let dates: Vec<String> = (1..=100).map(|day| format!("2026-{day:04}")).collect();
        let frequencies: Vec<f64> = dates
            .iter()
            .map(|d| Puzzle::generate(d).signal.frequency)
            .collect();

        let differing = frequencies.windows(2).filter(|w| w[0] != w[1]).count();
        assert!(
            differing >= 95,
            "expected >=95/99 consecutive dates to differ, got {differing}"
        );
    }

    #[test]
    fn all_emitters_stay_within_band_and_property_ranges() {
        for day in 1..=200 {
            let date = format!("2026-{day:04}");
            let puzzle = Puzzle::generate(&date);
            for emitter in all_emitters(&puzzle) {
                assert!(
                    (MIN_FREQUENCY..=MAX_FREQUENCY).contains(&emitter.frequency),
                    "frequency {} escaped band on {date}",
                    emitter.frequency
                );
                assert!((0.2..=0.9).contains(&emitter.duty_cycle));
                assert!((0.1..=0.6).contains(&emitter.noise_floor));
            }
        }
    }

    #[test]
    fn emitters_never_overlap_within_min_spacing() {
        for day in 1..=200 {
            let date = format!("2026-{day:04}");
            let puzzle = Puzzle::generate(&date);
            let emitters = all_emitters(&puzzle);
            for i in 0..emitters.len() {
                for j in (i + 1)..emitters.len() {
                    let gap = (emitters[i].frequency - emitters[j].frequency).abs();
                    assert!(
                        gap >= MIN_SPACING - f64::EPSILON,
                        "emitters {i} and {j} overlap on {date}: gap {gap}"
                    );
                }
            }
        }
    }

    #[test]
    fn empty_date_string_still_generates_a_valid_puzzle() {
        let puzzle = Puzzle::generate("");
        assert_eq!(puzzle.decoys.len(), DECOY_COUNT);
        assert!((MIN_FREQUENCY..=MAX_FREQUENCY).contains(&puzzle.signal.frequency));
    }
}
