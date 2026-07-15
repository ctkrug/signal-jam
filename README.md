# Signal Jam

A daily Wordle-style puzzle for people who like radios. Sweep a spectrum
analyzer across a noisy band, find the one signal that's hiding among the
decoys, and lock onto it before you run out of sweeps.

## What it is

Every day there's one hidden signal buried in a band of RF noise and
decoy emitters. Decoys look almost right — similar frequency, similar duty
cycle — but only one signal matches every property you're told to look for.
You get a limited number of sweeps (scrubs across the frequency axis) to
narrow it down. Each sweep paints a new row into a live waterfall display;
cross the real signal and it flares, snaps, and chimes. Guess wrong and a
decoy burns a sweep. Everyone gets the same puzzle each day, one puzzle a
day, shareable result grid — same shape as Wordle, different genre.

## Why

Most daily-puzzle games are word or number games. There's no daily puzzle
that borrows the *feel* of signals intelligence / ham radio hunting —
sweeping a waterfall, reading duty cycle and frequency hop patterns,
listening for the moment noise resolves into signal. That's a genuinely
different mechanic, it's visually striking (a live scrolling waterfall
is satisfying to watch even before you know how to play), and it's a
natural fit for a tight, replayable 2-minute session.

## Features

- Daily deterministic puzzle (same seed for everyone, same day)
- Live-scrolling waterfall display rendered on `<canvas>`, driven by a
  Rust/WASM simulation core for 60fps sweep rendering
- Spectrum mechanics: hidden signal defined by frequency, duty cycle, and
  noise floor; decoys share a subset of those properties, and hitting one
  reveals which property gave it away
- Limited sweeps per puzzle with a snap/lock/chime moment when the cursor
  crosses the real signal
- Win/lose overlay with a shareable emoji-style result grid, and a live
  countdown to the next puzzle on a loss
- Local persistence of daily results and a win streak, mute toggle
  included (no accounts, no backend)

## Stack

- **Rust**, compiled to `wasm32-unknown-unknown` via `wasm-bindgen`, for the
  puzzle/simulation core (signal generation, sweep scoring, RNG seeded by
  date)
- **TypeScript + Canvas 2D** for the waterfall renderer and UI shell
- **Vite** for dev server and bundling the WASM + TS into a static site
- No backend, no database, no accounts — everything ships as a static
  site (see `docs/VISION.md` for the deployment shape)

## Development

```
cd web
npm install
npm run dev       # builds the wasm core, then starts a dev server
npm test          # vitest
npm run lint
npm run build      # static build into web/dist/, subpath-relative
```

See `docs/ARCHITECTURE.md` for the module map and data flow, and
`cd crate && cargo test` for the Rust core's own test suite.

## Status

The full daily loop is playable end to end: deterministic puzzle, live
waterfall, decoy hints, the flare/lock/chime win moment, win/loss
overlays with share text, and streak/mute persistence across reloads.
See `docs/VISION.md` for the design and `docs/BACKLOG.md` for what's left.

## License

MIT — see `LICENSE`.
