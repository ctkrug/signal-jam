# Vision — Signal Jam

## The problem

Daily puzzle games are almost all word games (Wordle and its many clones)
or number games (Sudoku-likes, Connections-style grouping). That's a
crowded, homogeneous space. Nobody has built a daily puzzle around the
*feel* of hunting a radio signal — sweeping across a spectrum, reading
noise floor and duty cycle, watching a waterfall scroll — even though
that feel is visually striking and mechanically distinct from anything
in the current daily-puzzle landscape.

## Who it's for

People who already have a daily-puzzle habit (Wordle, Connections,
Nerdle) and want something that isn't another word or number game.
Doesn't require any real radio/SIGINT knowledge — the puzzle teaches its
own vocabulary (frequency, duty cycle, noise floor) through play, the way
Wordle teaches its own color-feedback language. A secondary audience:
people who like the *aesthetic* of radios, oscilloscopes, and old
electronics and will bounce off a screenshot alone.

## The core idea

Each day there is one hidden signal buried in a band of frequencies full
of noise and decoy emitters. The player sweeps a cursor across the band;
sweeping paints a new row into a live-scrolling waterfall display, so the
whole history of the sweep is visible as a scrolling image, not just the
current instant. Every signal (real or decoy) has a frequency, a duty
cycle, and sits above a noise floor; decoys share some but never all of
the real signal's properties, and the game reveals property hints as
sweeps are spent. The player has a limited number of sweeps; crossing the
real signal triggers the flare-and-lock wow moment; crossing a decoy
costs a sweep without winning. Everyone plays the same deterministically
seeded puzzle each day (seeded from the UTC date) and can share a
result — same shape as Wordle's grid, filled with the day's sweep outcomes
instead of letter guesses.

## Key design decisions

- **Rust/WASM owns puzzle truth.** Signal generation, sweep scoring, and
  the seeded RNG live in `crate/` and compile to WASM. The web shell never
  reimplements game logic in TypeScript — it only renders what the core
  reports and forwards player input. This keeps the puzzle deterministic
  and testable independent of the renderer, and gives the sweep loop
  enough headroom to redraw the waterfall at 60fps without a JS
  bottleneck.
- **No backend.** The daily seed is derived from the UTC date client-side;
  there's no server issuing puzzles or validating results. Streak/stats
  persist to `localStorage`. This keeps the project a static site
  (`web/dist/`) deployable to a subpath with zero infrastructure, and
  keeps cost at $0.
- **The waterfall is the hero, not a HUD.** Most of the design effort goes
  into the live waterfall canvas — see `docs/DESIGN.md` — because the
  entire pitch of this project (a signal resolving out of noise) lives or
  dies on how that display feels to watch and sweep across.
- **Decoys are informative, not just distractors.** A decoy should teach
  the player something about the real signal's properties when they hit
  it (e.g. "wrong duty cycle") rather than just failing silently — this
  keeps the puzzle a deduction game, not a guessing game.
- **One puzzle, one sitting.** No timer pressure, no combo/streak scoring
  beyond a simple day counter — the design goal is a 2-minute session,
  not a leaderboard grind.

## What "v1 done" looks like

- A player can load the site with no explanation, sweep the waterfall,
  and reach the flare/lock/chime wow moment within their first attempt at
  understanding the controls.
- The daily puzzle is deterministic: the same UTC date always produces
  the same signal, decoys, and sweep budget for every player.
- A full puzzle is playable start to finish: sweeping, decoy feedback,
  the lock, a win screen with shareable result text, and a loss state
  when sweeps run out.
- Streak and last-result persist across reloads via `localStorage`.
- The build produces a single static `web/dist/` directory that runs
  correctly when served from a subpath (relative asset paths throughout),
  ready for `apps.charliekrug.com/signal-jam`.
- The page follows `docs/DESIGN.md` in full: themed controls, the juice
  plan (tweened sweep, decoy bump, flare/lock, win celebration, synth
  SFX with persistent mute), responsive at phone and desktop widths.
- CI is green: Rust fmt/clippy/tests and the web build/lint/test suite
  all pass on every push.
