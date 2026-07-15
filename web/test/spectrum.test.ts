import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { computeRowAmplitudes, emitterContribution, findHoveredEmitter, REVEAL_RADIUS } from "../src/spectrum";

const noNoise = () => 0;

describe("emitterContribution", () => {
  it("is zero when the cursor hasn't swept yet", () => {
    expect(emitterContribution(0.5, 0.5, 0.5, null)).toBe(0);
  });

  it("is zero once the cursor is further than the reveal radius away", () => {
    expect(emitterContribution(0.5, 0.5, 0.5, 0.5 + REVEAL_RADIUS + 0.01)).toBe(0);
  });

  it("peaks at the emitter's own bin when the cursor sits on it", () => {
    const onEmitter = emitterContribution(0.5, 0.5, 0.5, 0.5);
    const offEmitter = emitterContribution(0.6, 0.5, 0.5, 0.5);
    expect(onEmitter).toBeGreaterThan(offEmitter);
    expect(onEmitter).toBeGreaterThan(0);
  });

  it("grows as the cursor approaches the emitter", () => {
    const near = emitterContribution(0.5, 0.5, 0.5, 0.51);
    const far = emitterContribution(0.5, 0.5, 0.5, 0.5 + REVEAL_RADIUS - 0.001);
    expect(near).toBeGreaterThan(far);
  });

  it("forceFull ignores cursor distance entirely (locked signal)", () => {
    expect(emitterContribution(0.5, 0.5, 0.5, null, { forceFull: true })).toBeGreaterThan(0);
    expect(emitterContribution(0.5, 0.5, 0.5, 0.99, { forceFull: true })).toBeGreaterThan(0);
  });
});

describe("findHoveredEmitter", () => {
  const signal = { frequency: 0.5, dutyCycle: 0.6, noiseFloor: 0.3 };
  const decoys = [
    { frequency: 0.2, dutyCycle: 0.4, noiseFloor: 0.2 },
    { frequency: 0.8, dutyCycle: 0.5, noiseFloor: 0.4 },
  ];

  it("returns null when the cursor hasn't swept yet", () => {
    expect(findHoveredEmitter(null, signal, decoys)).toBeNull();
  });

  it("returns null over open noise, away from every emitter", () => {
    expect(findHoveredEmitter(0.65, signal, decoys)).toBeNull();
  });

  it("finds the signal when the cursor sits on it", () => {
    const hit = findHoveredEmitter(0.5, signal, decoys);
    expect(hit).toEqual({ ...signal, isSignal: true });
  });

  it("finds a decoy when the cursor sits on it", () => {
    const hit = findHoveredEmitter(0.79, signal, decoys);
    expect(hit).toEqual({ ...decoys[1], isSignal: false });
  });

  it("prefers the nearest emitter when two are both in range", () => {
    const farSignal = { ...signal, frequency: 0.9 };
    const tight = [
      { frequency: 0.48, dutyCycle: 0.1, noiseFloor: 0.1 },
      { frequency: 0.53, dutyCycle: 0.9, noiseFloor: 0.9 },
    ];
    const hit = findHoveredEmitter(0.502, farSignal, tight, 0.05);
    expect(hit?.frequency).toBe(0.48);
  });

  it("respects a custom revealRadius", () => {
    expect(findHoveredEmitter(0.5, signal, decoys, 0)).toEqual({ ...signal, isSignal: true });
    expect(findHoveredEmitter(0.51, signal, decoys, 0)).toBeNull();
  });

  it("treats a NaN cursor frequency as hovering nothing", () => {
    expect(findHoveredEmitter(NaN, signal, decoys)).toBeNull();
  });
});

describe("computeRowAmplitudes", () => {
  it("returns arrays sized to binCount, clamped to [0, 1]", () => {
    const { green, amber } = computeRowAmplitudes(
      {
        cursorFrequency: 0.5,
        signal: { frequency: 0.5, dutyCycle: 0.9 },
        decoys: [{ frequency: 0.5, dutyCycle: 0.9 }],
        locked: false,
        binCount: 16,
      },
      noNoise,
    );
    expect(green).toHaveLength(16);
    expect(amber).toHaveLength(16);
    for (const v of [...green, ...amber]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("routes decoy energy to amber and signal energy to green", () => {
    const { green, amber } = computeRowAmplitudes(
      {
        cursorFrequency: 0.2,
        signal: { frequency: 0.8, dutyCycle: 0.9 }, // far away, cursor near decoy instead
        decoys: [{ frequency: 0.2, dutyCycle: 0.9 }],
        locked: false,
        binCount: 8,
      },
      noNoise,
    );
    const peakBin = 1; // ~0.2 with 8 bins spanning [0,1]
    expect(amber[peakBin]).toBeGreaterThan(0);
    expect(green[peakBin]).toBe(0);
  });

  it("keeps the signal bump visible when locked even off-cursor", () => {
    const { green } = computeRowAmplitudes(
      {
        cursorFrequency: 0.05,
        signal: { frequency: 0.9, dutyCycle: 0.9 },
        decoys: [],
        locked: true,
        binCount: 32,
      },
      noNoise,
    );
    const peakBin = Math.round(0.9 * 31);
    expect(green[peakBin]).toBeGreaterThan(0);
  });

  it("handles an empty decoy list and a single-bin row without crashing", () => {
    const result = computeRowAmplitudes(
      {
        cursorFrequency: 0.5,
        signal: { frequency: 0.5, dutyCycle: 0.5 },
        decoys: [],
        locked: false,
        binCount: 1,
      },
      noNoise,
    );
    expect(result.green).toHaveLength(1);
    expect(result.amber[0]).toBe(0);
  });

  it("never produces NaN amplitudes when the cursor frequency is NaN", () => {
    // Defense in depth: nothing in main.ts can currently hand this
    // function a NaN cursor, but a pure render function shouldn't trust
    // that — a NaN here would silently corrupt every bin's fillStyle.
    const { green, amber } = computeRowAmplitudes(
      {
        cursorFrequency: NaN,
        signal: { frequency: 0.5, dutyCycle: 0.9 },
        decoys: [{ frequency: 0.2, dutyCycle: 0.9 }],
        locked: false,
        binCount: 8,
      },
      noNoise,
    );
    for (const v of [...green, ...amber]) {
      expect(Number.isNaN(v)).toBe(false);
    }
  });
});

describe("spectrum property tests", () => {
  const emitter = fc.record({
    frequency: fc.double({ min: 0, max: 1, noNaN: true }),
    dutyCycle: fc.double({ min: 0, max: 1, noNaN: true }),
  });
  const readout = fc.record({
    frequency: fc.double({ min: 0, max: 1, noNaN: true }),
    dutyCycle: fc.double({ min: 0, max: 1, noNaN: true }),
    noiseFloor: fc.double({ min: 0, max: 1, noNaN: true }),
  });
  const cursor = fc.option(fc.double({ min: -1, max: 2, noNaN: true }), { nil: null });

  it("computeRowAmplitudes always stays within [0, 1] regardless of inputs", () => {
    fc.assert(
      fc.property(
        cursor,
        emitter,
        fc.array(emitter, { maxLength: 6 }),
        fc.boolean(),
        fc.integer({ min: 1, max: 200 }),
        (cursorFrequency, signal, decoys, locked, binCount) => {
          const { green, amber } = computeRowAmplitudes(
            { cursorFrequency, signal, decoys, locked, binCount },
            () => 0,
          );
          for (const v of [...green, ...amber]) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
          }
        },
      ),
    );
  });

  it("emitterContribution is never negative and never exceeds 1", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        emitter,
        cursor,
        (binFrequency, e, cursorFrequency) => {
          const v = emitterContribution(binFrequency, e.frequency, e.dutyCycle, cursorFrequency);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        },
      ),
    );
  });

  it("findHoveredEmitter only ever returns an emitter within revealRadius", () => {
    fc.assert(
      fc.property(
        cursor,
        readout,
        fc.array(readout, { maxLength: 6 }),
        (cursorFrequency, signal, decoys) => {
          const hit = findHoveredEmitter(cursorFrequency, signal, decoys);
          if (hit !== null) {
            expect(cursorFrequency).not.toBeNull();
            expect(Math.abs(hit.frequency - (cursorFrequency as number))).toBeLessThanOrEqual(REVEAL_RADIUS);
          }
        },
      ),
    );
  });
});
