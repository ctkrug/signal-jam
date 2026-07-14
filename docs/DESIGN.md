# Design direction — Signal Jam

## 1. Aesthetic direction

**Signal Jam is a field radio console:** a dark hardware chassis with a
phosphor-green waterfall CRT, amber warning accents, and the confident,
slightly worn precision of a signals-intelligence receiver panel — not a
sterile app, a piece of equipment you *operate*. Blueprint/technical meets
retro-arcade/CRT: real dial-label typography, a scanline sweep, a glow that
reads as electronics rather than decoration.

This sits deliberately away from "dark gray cards + one accent": the base
is a warm near-black *slate*, not neutral gray, and the accent is a single
saturated phosphor green used sparingly against amber warnings — a
two-hue signal system, not a rainbow of feature-card colors.

## 2. Tokens

### Color

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b0f0e` | page background (warm near-black, slight green cast) |
| `--surface-1` | `#121917` | panel / chassis surface |
| `--surface-2` | `#1a2320` | raised panel / card (buttons, readouts) |
| `--border` | `#2a3733` | panel seams, dividers |
| `--text` | `#e8f2ec` | primary text (off-white, cool) |
| `--text-muted` | `#8fa39a` | secondary labels, dial captions |
| `--accent` | `#3dff9a` | phosphor green — signal lock, primary actions |
| `--accent-dim` | `#1f8a58` | accent at rest / inactive state |
| `--accent-support` | `#ffb454` | amber — warnings, decoys, sweep cursor |
| `--danger` | `#ff5d5d` | wrong lock, out-of-sweeps |
| `--success` | `#3dff9a` | shares the phosphor accent — a win *is* a lock |

Contrast check: `--text` on `--bg` ≈ 15.8:1, `--text-muted` on `--bg` ≈
6.9:1, `--accent` on `--surface-1` ≈ 9.7:1 — all clear 4.5:1 for body text.

### Type

- **Display** — [Rajdhani](https://fonts.google.com/specimen/Rajdhani)
  (600/700), condensed-technical, used for the wordmark and headings.
  Fallback: `"Segoe UI", system-ui, sans-serif`.
- **UI / data** — [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono)
  (400/500), used for all readouts, frequencies, labels, and body copy —
  everything on a radio console is a monospaced readout. Fallback:
  `ui-monospace, "SF Mono", Consolas, monospace`.
- Type scale: 1.25 ratio — 12 / 15 / 19 / 24 / 30 / 38 / 48px.

### Spacing, shape, motion

- Spacing unit: **8px** scale (4px half-step allowed for hairline gaps).
- Corner radius: **4px** on panels/buttons (chassis edges, not soft/app-like).
- Depth: layered `box-shadow` — a tight dark contact shadow plus a soft
  `--accent` glow (`0 0 24px rgba(61,255,154,.18)`) on active/locked
  elements, echoing CRT phosphor bloom. Panels use a 1px `--border` seam,
  never a bare color-to-color edge.
- Motion: UI transitions **160ms ease-out**; game feedback (sweep tick,
  flare, lock) **80–120ms**; the lock snap itself is a **90ms** overshoot
  ease for a mechanical "click" feel.

## 3. Layout intent

**The hero is the waterfall display** — the live-scrolling spectrogram
canvas the player sweeps across. It is the largest, first thing on the
page in every layout.

- **Desktop 1440×900:** waterfall canvas occupies the top ~65vh, full
  width inside a chassis frame with a thin bezel; below it a control strip
  (sweep slider/dial, lock button, sweeps-remaining readout, mute) spans
  the width. A slim header bar (wordmark + streak/day counter) sits above
  the canvas, never competing with it for space.
- **Mobile 390×844:** canvas keeps ~55vh (still the dominant element),
  header collapses to a compact bar, controls stack below as large
  touch-friendly (≥44px) targets — the sweep control becomes a horizontal
  drag strip spanning the width instead of a small dial.
- No dead background seas: the chassis frame, bezel screws/vents, and a
  subtle scanline/grain texture fill margin space instead of leaving flat
  empty color.

## 4. Signature detail

The wordmark **"SIGNAL JAM"** has a **scanline sweep on load**: a thin
phosphor-green line passes left-to-right through the letters once,
leaving a brief bloom trail (CSS `background-position` animation clipped
to text) — same visual language as the in-game sweep, establishing the
metaphor before the player touches anything. A small circular status LED
before the wordmark blinks slowly (on-air indicator) and turns solid
green the moment a puzzle is won for the day.

## 5. Juice plan (game feel)

- **Sweep movement:** the scan cursor follows pointer/drag with a 90ms
  ease-out tween, never teleporting; the waterfall scrolls continuously
  at a steady rate independent of sweep speed.
- **Impact feedback:** crossing a decoy triggers a quick amber flash on
  the cursor line + a 2px/60ms micro-shake of the chassis frame.
- **Goal feedback:** crossing the real signal triggers the **flare**: the
  signal line blooms to full brightness, the cursor snaps and locks to
  its exact frequency (90ms overshoot-ease), and a green pulse ring
  expands from the lock point.
- **Win celebration:** a results overlay slides up from the bottom with
  the day's stats (sweeps used, time), a shareable emoji-grid row, a
  brief particle sparkle along the locked frequency line, and one primary
  CTA ("Share result" / "Come back tomorrow").
- **Synth SFX (WebAudio, generated — no audio files), all rate-throttled
  with a persistent mute toggle:**
  - `sweep-tick` — soft short sine blip as the cursor crosses each minor
    frequency division, pitched to the cursor's current frequency.
  - `decoy-bump` — short detuned square/noise burst, low volume.
  - `flare-lock` — rising sine sweep into a clean bell-like tone (the
    "snap and chime" from the wow moment) when the real signal locks.
  - `win-jingle` — a brief 3-note ascending synth arpeggio on puzzle win.
  - `lose-tone` — a low descending tone on out-of-sweeps.
  - Mute toggle persists to `localStorage`; `AudioContext` is created
    lazily on first user gesture and all SFX calls no-op gracefully if
    WebAudio is unavailable (test environments).
- Respect `prefers-reduced-motion`: drop chassis shake and particle
  sparkle, keep the lock-snap and color/opacity feedback (function stays,
  motion-heavy flourish goes).
