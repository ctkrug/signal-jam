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
            sweep_budget: DECOY_COUNT as u32 + 3,
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
