---
title: "Building Signal Jam: a daily spectrum-sweeping puzzle in Rust and WASM"
published: false
tags: rust, webassembly, gamedev, javascript
---

Almost every daily puzzle game is a word game or a number game. I wanted to
make one that felt like something else entirely: hunting a hidden radio signal
across a noisy band, the way a receiver operator sweeps a spectrum analyzer.
That became [Signal Jam](https://apps.charliekrug.com/signal-jam/), a free daily
puzzle you play in the browser. Here are the two or three build decisions that
turned out to matter most.

## The puzzle lives in Rust, the browser only draws

The rule I set early: no game logic in TypeScript. All the truth about a puzzle
(the hidden signal, the decoys, whether a given sweep is a hit) lives in a Rust
core compiled to `wasm32-unknown-unknown`. The web shell forwards pointer input
and renders whatever the core reports back. It never re-derives game state.

That split paid off in three ways. The daily puzzle is deterministic and
testable as plain Rust, with no DOM in the loop. The scoring logic is a single
small state machine, so "did that sweep hit a decoy" has exactly one answer in
exactly one place. And the hot path (redrawing the spectrogram every frame) has
no JavaScript logic bottleneck fighting it for the frame budget.

The scoring core is an edge-detector. A sweep only counts when the cursor first
enters an emitter's detection window, not on every frame it lingers there:

```rust
let target = self.find_target(frequency);
if target == self.current_target {
    return SweepEvent::None; // still on the same thing, nothing new
}
self.current_target = target;
```

Without that, holding the cursor over a decoy would drain your whole sweep
budget in a few hundred milliseconds. With it, crossing a decoy costs exactly
one sweep and re-crossing a spent one is free.

## The waterfall is one `drawImage` trick

The signature visual is a waterfall: a spectrogram that scrolls upward so your
whole search history stays on screen. The naive version keeps a 2D history
buffer and repaints every pixel every frame. I did not want to pay for that.

Instead, each frame the canvas copies itself up by one pixel and paints a single
new row at the bottom:

```ts
ctx.drawImage(canvas, 0, 1, width, height - 1, 0, 0, width, height - 1);
// then fill row (height - 1) with this frame's amplitudes
```

The GPU-backed blit does the scrolling for free, and I only ever compute one new
row of amplitudes per frame. The amplitude math itself is a pure function
(cursor frequency plus emitter list in, per-bin brightness out), which kept it
easy to test and easy to reason about when a `NaN` cursor value once leaked a
blank row into the display.

## No backend, seeded by the date

There is no server. The daily seed is an FNV-1a hash of the UTC date string
feeding a small SplitMix64 generator, so everyone gets the same board on the
same day and I host the whole thing as static files. Streak and last result go
in `localStorage`. The cost to run it is zero, and there is no account to make.

## What I would do differently

Two things. First, I would design the share grid before the scoring model, not
after. The grid can only encode outcomes it has data for, and I had to thread
the per-sweep outcome list back through afterward. Second, I leaned on
property-based tests late (proptest on the Rust side, fast-check on the web
side, throwing arbitrary date strings and cursor sequences at the invariants).
Every real bug I found near the end, a corrupt-`localStorage` crash and that
`NaN` amplitude, was the kind of thing a property test catches on the first run.
I should have written them first.

If you want to try it, it is live at
[apps.charliekrug.com/signal-jam](https://apps.charliekrug.com/signal-jam/) and
the source is on [GitHub](https://github.com/ctkrug/signal-jam). I would love to
hear whether the first sweep makes sense without any instructions.
</content>
