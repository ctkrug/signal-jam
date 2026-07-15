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

/// Duty cycle draw range, shared by the signal and every decoy.
pub const DUTY_CYCLE_RANGE: (f64, f64) = (0.2, 0.9);

/// Noise floor draw range, shared by the signal and every decoy.
pub const NOISE_FLOOR_RANGE: (f64, f64) = (0.1, 0.6);

/// How close a decoy's property must be to the signal's to count as
/// "matching" for the property-hint deduction game (see [`Property`]).
pub const DUTY_CYCLE_MATCH_TOLERANCE: f64 = 0.12;
pub const NOISE_FLOOR_MATCH_TOLERANCE: f64 = 0.1;

/// A single detectable emitter on the band: the real signal and every
/// decoy share this shape.
#[derive(Debug, Clone, PartialEq)]
pub struct Emitter {
    pub frequency: f64,
    pub duty_cycle: f64,
    pub noise_floor: f64,
}

/// Which of a decoy's properties fails to match the real signal. A
/// decoy's frequency always differs from the signal's (that's structural
/// — [`MIN_SPACING`] guarantees it, and it's the whole premise of
/// sweeping to find the signal), so it's never an interesting hint; the
/// mismatch tag only ever covers duty cycle or noise floor, with the
/// other one drawn to match within tolerance — this is what "hitting a
/// decoy reveals a hint" means in play.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Property {
    DutyCycle,
    NoiseFloor,
}

/// A decoy emitter, tagged with the one property that gives it away.
#[derive(Debug, Clone, PartialEq)]
pub struct Decoy {
    pub emitter: Emitter,
    pub mismatch: Property,
}

/// A fully generated daily puzzle.
#[derive(Debug, Clone, PartialEq)]
pub struct Puzzle {
    pub date: String,
    pub signal: Emitter,
    pub decoys: Vec<Decoy>,
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

            let mismatch = pick_mismatch_property(&mut rng);
            let duty_cycle = place_decoy_property(
                &mut rng,
                signal.duty_cycle,
                DUTY_CYCLE_RANGE,
                DUTY_CYCLE_MATCH_TOLERANCE,
                mismatch == Property::DutyCycle,
            );
            let noise_floor = place_decoy_property(
                &mut rng,
                signal.noise_floor,
                NOISE_FLOOR_RANGE,
                NOISE_FLOOR_MATCH_TOLERANCE,
                mismatch == Property::NoiseFloor,
            );

            decoys.push(Decoy {
                emitter: Emitter {
                    frequency,
                    duty_cycle,
                    noise_floor,
                },
                mismatch,
            });
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
        duty_cycle: rng.next_range(DUTY_CYCLE_RANGE.0, DUTY_CYCLE_RANGE.1),
        noise_floor: rng.next_range(NOISE_FLOOR_RANGE.0, NOISE_FLOOR_RANGE.1),
    }
}

fn pick_mismatch_property(rng: &mut Rng) -> Property {
    match rng.next_range(0.0, 2.0) as u32 {
        0 => Property::DutyCycle,
        _ => Property::NoiseFloor,
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

fn property_matches_signal(candidate: f64, signal_value: f64, tolerance: f64) -> bool {
    (candidate - signal_value).abs() <= tolerance
}

/// Draws a duty-cycle or noise-floor value that matches (or deliberately
/// fails to match) the signal's value within `tolerance`, per
/// `should_mismatch`. Retries a bounded number of times before giving up
/// and returning the last candidate.
fn place_decoy_property(
    rng: &mut Rng,
    signal_value: f64,
    range: (f64, f64),
    tolerance: f64,
    should_mismatch: bool,
) -> f64 {
    let draw = |rng: &mut Rng| {
        if should_mismatch {
            rng.next_range(range.0, range.1)
        } else {
            let lo = (signal_value - tolerance).max(range.0);
            let hi = (signal_value + tolerance).min(range.1);
            rng.next_range(lo, hi)
        }
    };

    let mut candidate = draw(rng);
    for _ in 0..64 {
        if property_matches_signal(candidate, signal_value, tolerance) != should_mismatch {
            return candidate;
        }
        candidate = draw(rng);
    }
    candidate
}

#[cfg(test)]
mod tests {
    use super::*;

    fn all_emitters(puzzle: &Puzzle) -> Vec<&Emitter> {
        let mut all = vec![&puzzle.signal];
        all.extend(puzzle.decoys.iter().map(|d| &d.emitter));
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

    /// Each decoy is tagged with exactly one mismatching property; this
    /// checks the tag reflects reality: the tagged property sits outside
    /// its match tolerance while the other two sit inside it. The match
    /// bias is a best-effort retry loop (see `place_decoy_frequency` /
    /// `place_decoy_property`), so this asserts a high pass rate rather
    /// than perfection, mirroring `most_consecutive_dates_produce_*`.
    #[test]
    fn decoy_mismatch_tag_matches_its_actual_properties_almost_always() {
        let mut checked = 0;
        let mut correct = 0;

        for day in 1..=200 {
            let date = format!("2026-{day:04}");
            let puzzle = Puzzle::generate(&date);
            for decoy in &puzzle.decoys {
                checked += 1;
                let duty_matches = property_matches_signal(
                    decoy.emitter.duty_cycle,
                    puzzle.signal.duty_cycle,
                    DUTY_CYCLE_MATCH_TOLERANCE,
                );
                let noise_matches = property_matches_signal(
                    decoy.emitter.noise_floor,
                    puzzle.signal.noise_floor,
                    NOISE_FLOOR_MATCH_TOLERANCE,
                );

                let matches_as_tagged = match decoy.mismatch {
                    Property::DutyCycle => !duty_matches && noise_matches,
                    Property::NoiseFloor => duty_matches && !noise_matches,
                };
                if matches_as_tagged {
                    correct += 1;
                }
            }
        }

        assert!(
            correct as f64 / checked as f64 >= 0.95,
            "expected >=95% of {checked} decoys to match their mismatch tag, got {correct}"
        );
    }

    #[test]
    fn mismatch_property_is_not_degenerately_constant() {
        let mut seen_duty = false;
        let mut seen_noise = false;

        for day in 1..=50 {
            let date = format!("2026-{day:04}");
            let puzzle = Puzzle::generate(&date);
            for decoy in &puzzle.decoys {
                match decoy.mismatch {
                    Property::DutyCycle => seen_duty = true,
                    Property::NoiseFloor => seen_noise = true,
                }
            }
        }

        assert!(seen_duty && seen_noise);
    }
}

#[cfg(test)]
mod proptests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        /// The date string is untrusted input from `getUtcDateString()` in
        /// normal operation, but nothing here actually enforces that shape
        /// — so any string thrown at it (empty, unicode, huge, control
        /// characters) must still generate a structurally valid puzzle
        /// rather than panicking or escaping its invariants.
        #[test]
        fn arbitrary_date_strings_never_break_puzzle_invariants(date in ".{0,300}") {
            let puzzle = Puzzle::generate(&date);

            prop_assert_eq!(puzzle.decoys.len(), DECOY_COUNT);
            prop_assert_eq!(puzzle.sweep_budget, DECOY_COUNT as u32 - 1);

            let mut all = vec![&puzzle.signal];
            all.extend(puzzle.decoys.iter().map(|d| &d.emitter));

            for emitter in &all {
                prop_assert!((MIN_FREQUENCY..=MAX_FREQUENCY).contains(&emitter.frequency));
                prop_assert!((DUTY_CYCLE_RANGE.0..=DUTY_CYCLE_RANGE.1).contains(&emitter.duty_cycle));
                prop_assert!((NOISE_FLOOR_RANGE.0..=NOISE_FLOOR_RANGE.1).contains(&emitter.noise_floor));
            }

            for i in 0..all.len() {
                for j in (i + 1)..all.len() {
                    let gap = (all[i].frequency - all[j].frequency).abs();
                    prop_assert!(gap >= MIN_SPACING - f64::EPSILON);
                }
            }
        }

        /// The same arbitrary date string generates byte-identical puzzles
        /// on repeated calls — determinism must hold for any input, not
        /// just well-formed calendar dates.
        #[test]
        fn arbitrary_date_strings_are_deterministic(date in ".{0,300}") {
            let a = Puzzle::generate(&date);
            let b = Puzzle::generate(&date);
            prop_assert_eq!(a, b);
        }
    }
}
