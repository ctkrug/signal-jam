//! Deterministic PRNG seeded from an arbitrary string (the UTC date).
//!
//! SplitMix64 gives a fast, well-mixed stream from a single 64-bit seed;
//! the seed itself comes from an FNV-1a hash of the date string so the
//! same date always produces the same stream, and different dates spread
//! out across the full seed space rather than clustering.

/// FNV-1a 64-bit hash, used to turn an arbitrary string into a seed.
fn fnv1a64(bytes: &[u8]) -> u64 {
    const OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0000_0100_0000_01b3;

    let mut hash = OFFSET_BASIS;
    for &b in bytes {
        hash ^= b as u64;
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

/// A SplitMix64 generator, seeded once and stepped forward on every draw.
pub struct Rng {
    state: u64,
}

impl Rng {
    /// Seeds the generator directly from a 64-bit value.
    pub fn from_seed(seed: u64) -> Self {
        Self { state: seed }
    }

    /// Seeds the generator from an arbitrary string (e.g. `"2026-07-15"`).
    pub fn from_seed_str(s: &str) -> Self {
        Self::from_seed(fnv1a64(s.as_bytes()))
    }

    /// Next raw 64-bit value in the stream.
    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Next float in `[0.0, 1.0)`.
    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Next float in `[lo, hi)`. Returns `lo` if `hi <= lo`.
    pub fn next_range(&mut self, lo: f64, hi: f64) -> f64 {
        if hi <= lo {
            return lo;
        }
        lo + self.next_f64() * (hi - lo)
    }
}
