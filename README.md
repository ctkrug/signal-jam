# Signal Jam

**▶ Live demo — [apps.charliekrug.com/signal-jam](https://apps.charliekrug.com/signal-jam/)**

[![CI](https://github.com/ctkrug/signal-jam/actions/workflows/ci.yml/badge.svg)](https://github.com/ctkrug/signal-jam/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A daily puzzle game in the browser: one hidden signal is buried in a band of
radio noise, and five decoys are doing their best to look just like it. Sweep a
spectrum analyzer across the band and lock onto the real signal before your
sweeps run out. New puzzle every day, same one for everyone.

It plays like Wordle, but the guesses are frequencies and the feedback is a
live-scrolling waterfall display instead of colored letters. No word knowledge,
no accounts, no backend.

## Who it's for

Anyone with a daily-puzzle habit (Wordle, Connections, Nerdle) who wants a break
from word and number games. You do not need to know anything about radios. The
puzzle teaches its own three properties as you play, the same way Wordle teaches
its green/yellow/gray language.

## How to play

1. **Sweep.** Drag across the frequency strip (or use the arrow keys). Each frame
   paints a new row into the waterfall, so your whole search history scrolls up
   the screen as an image.
2. **Read the clues.** Every emitter has a frequency, a duty cycle, and a noise
   floor. Cross a decoy and it costs you a sweep, but it also tells you which one
   property gives that decoy away. Clues stack up across the round.
3. **Lock it.** Cross the real signal and it flares, snaps to its exact frequency,
   and chimes. You have four sweeps to find it, so a wrong guess actually hurts.
4. **Share.** Win or lose, you get a Wordle-shaped result grid that shows how the
   round went without spoiling the answer.

## Sample result

The share grid encodes each sweep in order (amber for a decoy, green for the
lock) and never leaks the day's frequency:

```
Signal Jam Day 12
🟧🟧🟩⬛⬛
2/4 sweeps
```

## Features

- **A new deterministic puzzle every day.** The signal, decoys, and sweep budget
  are all derived from the UTC date, so everyone plays the same board and can
  compare grids.
- **A live waterfall you actually sweep.** The spectrogram is rendered on
  `<canvas>` and driven by a Rust/WASM core, so the sweep stays smooth while the
  display scrolls.
- **Decoys that teach.** Hitting a decoy reveals the single property (duty cycle
  or noise floor) that fails to match the signal, turning the round into
  deduction instead of guessing.
- **A win that lands.** Crossing the signal triggers a flare, a lock snap, a
  pulse ring, a spark burst, and a synthesized chime, with a stats overlay and a
  copyable share grid.
- **A daily habit.** Results and a win streak persist in `localStorage`; reload
  the same day and you see your finished board and a countdown to the next puzzle.
- **Sound you control.** All effects are synthesized in code (no audio files) and
  the mute toggle is remembered between visits.

## Built with

- **Rust** compiled to `wasm32-unknown-unknown` via `wasm-bindgen` for the puzzle
  and simulation core: signal generation, sweep scoring, and the date-seeded RNG.
- **TypeScript + Canvas 2D** for the waterfall renderer and the console UI.
- **Vite** to bundle the WASM and TS into a static site with relative paths, so it
  hosts from any subpath.
- No backend, no database, no accounts. The whole thing ships as static files.

## Development

```
cd web
npm install
npm run dev       # builds the wasm core, then starts a dev server
npm test          # vitest
npm run lint
npm run build     # static build into web/dist/, subpath-relative
```

Building the web app compiles the Rust core to WASM first, so you need a Rust
toolchain with the `wasm32-unknown-unknown` target and `wasm-bindgen-cli`
installed. The Rust core has its own suite:

```
cd crate
cargo test
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the module map and data
flow, and [`docs/VISION.md`](docs/VISION.md) for the design rationale.

## License

MIT license. See [`LICENSE`](LICENSE).

---

More of Charlie's projects → [apps.charliekrug.com](https://apps.charliekrug.com)
</content>
</invoke>
