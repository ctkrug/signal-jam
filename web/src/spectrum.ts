/**
 * Pure amplitude math for one waterfall row. Kept free of the DOM/canvas
 * so it's directly testable: given a cursor frequency and the puzzle's
 * emitters, decide how "hot" each frequency bin looks this frame.
 *
 * An emitter is only visible once the cursor sweeps within
 * `revealRadius` of it (the receiver has to be tuned close enough to
 * pick it up) — narrower than that, engine.ts's own lock/decoy
 * tolerances decide the actual hit; this is only the visual preview.
 */

export const REVEAL_RADIUS = 0.05;
export const EMITTER_WIDTH = 0.02;

export interface EmitterVis {
  frequency: number;
  dutyCycle: number;
}

export interface RowInput {
  cursorFrequency: number | null;
  signal: EmitterVis;
  decoys: EmitterVis[];
  locked: boolean;
  binCount: number;
}

export interface RowAmplitudes {
  /** Signal + ambient noise channel (renders phosphor green). */
  green: Float32Array;
  /** Decoy channel (renders amber). */
  amber: Float32Array;
}

function bumpShape(binFrequency: number, emitterFrequency: number, width: number): number {
  const d = (binFrequency - emitterFrequency) / width;
  return Math.exp(-(d * d));
}

function proximityFactor(
  emitterFrequency: number,
  cursorFrequency: number | null,
  revealRadius: number,
): number {
  if (cursorFrequency === null || !Number.isFinite(cursorFrequency)) return 0;
  const distance = Math.abs(emitterFrequency - cursorFrequency);
  if (distance > revealRadius) return 0;
  return 1 - distance / revealRadius;
}

/** How much one emitter contributes to one frequency bin this frame. */
export function emitterContribution(
  binFrequency: number,
  emitterFrequency: number,
  dutyCycle: number,
  cursorFrequency: number | null,
  options: { revealRadius?: number; width?: number; forceFull?: boolean } = {},
): number {
  const revealRadius = options.revealRadius ?? REVEAL_RADIUS;
  const width = options.width ?? EMITTER_WIDTH;
  const proximity = options.forceFull ? 1 : proximityFactor(emitterFrequency, cursorFrequency, revealRadius);
  if (proximity <= 0) return 0;

  const shape = bumpShape(binFrequency, emitterFrequency, width);
  const peak = 0.35 + dutyCycle * 0.5;
  return shape * peak * proximity;
}

export interface EmitterReadout {
  frequency: number;
  dutyCycle: number;
  noiseFloor: number;
}

export interface HoveredEmitter extends EmitterReadout {
  isSignal: boolean;
}

/**
 * Finds whichever emitter (the real signal or a decoy) the cursor is
 * currently "over" — within `revealRadius`, same as what the waterfall
 * visually reveals — preferring the nearest one if more than one is in
 * range. Returns `null` when the cursor is over open noise (or hasn't
 * swept yet), the neutral state for the live readout.
 */
export function findHoveredEmitter(
  cursorFrequency: number | null,
  signal: EmitterReadout,
  decoys: EmitterReadout[],
  revealRadius: number = REVEAL_RADIUS,
): HoveredEmitter | null {
  if (cursorFrequency === null) return null;

  const candidates: HoveredEmitter[] = [
    { ...signal, isSignal: true },
    ...decoys.map((d) => ({ ...d, isSignal: false })),
  ];

  let nearest: HoveredEmitter | null = null;
  let nearestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.frequency - cursorFrequency);
    if (distance <= revealRadius && distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/**
 * Computes one row's per-bin amplitudes. `ambientNoise` supplies the
 * flicker baseline for each bin (real random noise in production, a
 * deterministic stub in tests).
 */
export function computeRowAmplitudes(
  input: RowInput,
  ambientNoise: (bin: number) => number,
): RowAmplitudes {
  const { binCount, signal, decoys, cursorFrequency, locked } = input;
  const green = new Float32Array(binCount);
  const amber = new Float32Array(binCount);

  for (let bin = 0; bin < binCount; bin++) {
    const binFrequency = binCount <= 1 ? 0 : bin / (binCount - 1);
    let g = ambientNoise(bin);
    let a = 0;

    g += emitterContribution(binFrequency, signal.frequency, signal.dutyCycle, cursorFrequency, {
      forceFull: locked,
    });

    for (const decoy of decoys) {
      a += emitterContribution(binFrequency, decoy.frequency, decoy.dutyCycle, cursorFrequency);
    }

    green[bin] = Math.min(1, g);
    amber[bin] = Math.min(1, a);
  }

  return { green, amber };
}
