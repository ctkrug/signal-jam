//! Signal Jam puzzle simulation core.
//!
//! Compiled to `wasm32-unknown-unknown` and consumed by the web shell in
//! `web/`. Owns puzzle generation, sweep scoring, and the deterministic
//! daily seed — nothing about rendering or DOM lives here.

use wasm_bindgen::prelude::*;

mod puzzle;
mod rng;

/// Confirms the WASM module loaded and can be called from JS.
#[wasm_bindgen]
pub fn greet() -> String {
    "Signal Jam core online".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greet_returns_expected_message() {
        assert_eq!(greet(), "Signal Jam core online");
    }
}
