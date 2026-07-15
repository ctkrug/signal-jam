//! Signal Jam puzzle simulation core.
//!
//! Compiled to `wasm32-unknown-unknown` and consumed by the web shell in
//! `web/`. Owns puzzle generation, sweep scoring, and the deterministic
//! daily seed — nothing about rendering or DOM lives here. The wasm
//! boundary in this file is a thin JSON-in/JSON-out wrapper around
//! [`engine::Engine`]; all real logic lives in `engine.rs` and
//! `puzzle.rs` where it's testable as plain Rust.

use serde::Serialize;
use wasm_bindgen::prelude::*;

mod engine;
mod puzzle;
mod rng;

use engine::{Engine, SweepEvent};
use puzzle::{Emitter, Puzzle};

#[derive(Serialize)]
struct EmitterJson {
    frequency: f64,
    duty_cycle: f64,
    noise_floor: f64,
}

impl From<&Emitter> for EmitterJson {
    fn from(e: &Emitter) -> Self {
        EmitterJson {
            frequency: e.frequency,
            duty_cycle: e.duty_cycle,
            noise_floor: e.noise_floor,
        }
    }
}

#[derive(Serialize)]
struct PuzzleInfoJson {
    date: String,
    sweep_budget: u32,
    lock_tolerance: f64,
    decoy_tolerance: f64,
    signal: EmitterJson,
    decoys: Vec<EmitterJson>,
}

impl From<&Puzzle> for PuzzleInfoJson {
    fn from(p: &Puzzle) -> Self {
        PuzzleInfoJson {
            date: p.date.clone(),
            sweep_budget: p.sweep_budget,
            lock_tolerance: engine::LOCK_TOLERANCE,
            decoy_tolerance: engine::DECOY_TOLERANCE,
            signal: (&p.signal).into(),
            decoys: p.decoys.iter().map(Into::into).collect(),
        }
    }
}

#[derive(Serialize)]
#[serde(tag = "kind")]
enum SweepEventJson {
    None,
    DecoyHit { index: usize },
    Locked { frequency: f64 },
    Exhausted,
    Ignored,
}

impl From<SweepEvent> for SweepEventJson {
    fn from(event: SweepEvent) -> Self {
        match event {
            SweepEvent::None => SweepEventJson::None,
            SweepEvent::DecoyHit { index } => SweepEventJson::DecoyHit { index },
            SweepEvent::Locked { frequency } => SweepEventJson::Locked { frequency },
            SweepEvent::Exhausted => SweepEventJson::Exhausted,
            SweepEvent::Ignored => SweepEventJson::Ignored,
        }
    }
}

fn to_json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("puzzle/engine JSON payloads are always finite and valid")
}

/// JS-facing handle for one puzzle's sweep session.
#[wasm_bindgen]
pub struct PuzzleSession {
    inner: Engine,
}

#[wasm_bindgen]
impl PuzzleSession {
    /// Starts a new session for `date` (a `"YYYY-MM-DD"` UTC date string).
    #[wasm_bindgen(constructor)]
    pub fn new(date: &str) -> PuzzleSession {
        PuzzleSession {
            inner: Engine::new(Puzzle::generate(date)),
        }
    }

    /// Static puzzle metadata as a JSON string: sweep budget, detection
    /// tolerances, and every emitter's frequency/duty-cycle/noise-floor.
    #[wasm_bindgen(js_name = puzzleInfo)]
    pub fn puzzle_info(&self) -> String {
        to_json(&PuzzleInfoJson::from(self.inner.puzzle()))
    }

    /// Processes one cursor position (`frequency` normalized `[0, 1]`) and
    /// returns the resulting `SweepEvent` as a JSON string.
    pub fn sweep(&mut self, frequency: f64) -> String {
        to_json(&SweepEventJson::from(self.inner.sweep(frequency)))
    }

    #[wasm_bindgen(js_name = isLocked)]
    pub fn is_locked(&self) -> bool {
        self.inner.is_locked()
    }

    #[wasm_bindgen(js_name = isExhausted)]
    pub fn is_exhausted(&self) -> bool {
        self.inner.is_exhausted()
    }

    #[wasm_bindgen(js_name = sweepsRemaining)]
    pub fn sweeps_remaining(&self) -> u32 {
        self.inner.sweeps_remaining()
    }
}
