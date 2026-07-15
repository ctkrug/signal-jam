# Backlog — Signal Jam

Epics are ordered for build sequencing. **Epic 1, Story 1.1 is the wow
moment** and must be reachable before anything else in this backlog is
built. All stories start unchecked; a later BUILD run checks a story off
only once every acceptance criterion below it is verifiably true.

## Epic 1 — Core sweep loop

The playable heart of the game: a real puzzle, sweepable, lockable.

- [x] **1.1 Sweep the waterfall and lock the hidden signal (WOW MOMENT)**
  - Dragging/moving the cursor across the frequency band paints a new
    row into the waterfall canvas each animation frame at the current
    sweep position.
  - When the cursor's frequency comes within lock tolerance of the
    puzzle's hidden signal, the signal flares (visible brightness
    increase) and the cursor snaps to the exact frequency within 90ms.
  - A synthesized chime (WebAudio) fires exactly once at the moment of
    lock, and the locked state persists — further sweeping does not
    un-lock — until the puzzle resets for a new day.

- [x] **1.2 Deterministic daily puzzle generation**
  - Given the same UTC date string, the Rust core returns the same
    hidden signal (frequency, duty cycle, noise floor) and decoy set on
    every call — covered by a unit test seeding two calls with the same
    date and asserting equal output.
  - Across a 100-date sample, at least 95 distinct dates produce a
    different hidden signal frequency than the date before it (guards
    against a seed function that degenerates toward a constant).

- [x] **1.3 Sweep budget and decoy feedback**
  - Sweeping across a decoy's frequency range consumes one sweep from a
    finite budget and shows a distinguishing bump/flash cue (amber),
    visually distinct from the win flare (green).
  - When the sweep budget reaches zero without locking the real signal,
    a loss state is shown and no further sweep input is accepted.

- [x] **1.4 Design polish — waterfall chassis and controls**
  - The waterfall canvas and control strip follow `docs/DESIGN.md`
    tokens (color, type, spacing); no default/unstyled browser button or
    slider is visible anywhere in the sweep UI.
  - At 390px width the layout has no horizontal scroll and every control
    has a touch target ≥44px.

## Epic 2 — Puzzle feedback & deduction

Turns "find the signal" into a legible deduction game, and gives the win
and loss states the weight the wow moment earned.

- [x] **2.1 Property hint reveal on decoy hit**
  - Hitting a decoy reveals which single property (frequency, duty
    cycle, or noise floor) does *not* match the real signal, shown as
    inline text near the waterfall.
  - Revealed hints accumulate across the session — a later hit doesn't
    overwrite or hide an earlier revealed hint.

- [x] **2.2 Frequency / duty-cycle / noise-floor readout**
  - A live readout shows the cursor's current frequency and the duty
    cycle/noise floor of whatever emitter (real or decoy) it is
    currently over, updating within one animation frame of cursor
    movement.
  - The readout goes to a neutral/blank state when the cursor is over
    empty noise with no emitter present.

- [ ] **2.3 Win screen with stats and share text**
  - On lock, an overlay shows sweeps used and a copyable share string
    (emoji-grid style, Wordle-shaped) encoding the day number and sweep
    outcomes without revealing the day's answer.
  - Clicking "copy" places the share text on the clipboard and shows a
    brief confirmation state (e.g. button label changes for ~2s).

- [ ] **2.4 Loss screen with reveal**
  - On loss (sweeps exhausted), an overlay reveals the real signal's
    exact frequency on the waterfall.
  - The overlay shows a "come back tomorrow" message with a live
    countdown to the next UTC day.

## Epic 3 — Persistence & daily structure

Makes it a *daily* habit instead of a one-off toy.

- [ ] **3.1 Streak and result persistence**
  - Completing a puzzle (win or loss) writes today's UTC-date result to
    `localStorage`; reloading the page the same day shows the completed
    result screen instead of a fresh puzzle.
  - A visible streak counter increments after a win that immediately
    follows the previous UTC day's win, and resets to 1 after a gap or a
    loss.

- [ ] **3.2 Mute toggle persistence**
  - Toggling mute updates a `localStorage` flag; reloading the page
    preserves the mute state and suppresses all SFX while muted.

- [ ] **3.3 Design polish — win/loss overlays and result grid**
  - Win and loss overlays follow `docs/DESIGN.md` (surface tokens,
    glow/shadow treatment, 160ms motion) and are dismissible via
    keyboard (Escape or a focused close control).
  - `prefers-reduced-motion` suppresses particle/shake effects on these
    overlays while overlay content and function stay intact.

## Epic 4 — Ship readiness

- [ ] **4.1 Responsive layout across breakpoints**
  - Page renders with no horizontal scroll and no overlapping elements
    at 390px, 768px, and 1440px, matching `docs/DESIGN.md`'s layout
    intent at each.

- [ ] **4.2 Accessibility pass**
  - All interactive controls are reachable and operable via keyboard
    (Tab, then Enter/Space) with a visible focus ring.
  - Icon-only buttons (mute, close) carry `aria-label` text, and sweep
    status changes are announced through an `aria-live` region.

- [ ] **4.3 Static build verified for subpath hosting**
  - `npm run build` produces a `web/dist/` directory that, served from a
    non-root path (e.g. `/signal-jam/`), loads with zero broken asset
    requests (verified by serving `dist/` locally under a subpath and
    inspecting network requests).

- [ ] **4.4 CI green end-to-end**
  - GitHub Actions CI passes `cargo fmt --check`, `cargo clippy -D
    warnings`, `cargo test`, and the web build/lint/test suite on a
    clean clone of `main`.
