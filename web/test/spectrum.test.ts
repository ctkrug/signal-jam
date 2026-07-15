import { describe, expect, it } from "vitest";
import { computeRowAmplitudes, emitterContribution, REVEAL_RADIUS } from "../src/spectrum";

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
});
