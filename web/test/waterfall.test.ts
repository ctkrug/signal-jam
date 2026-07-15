import { describe, expect, it } from "vitest";
import { mixColor } from "../src/waterfall";

function parseRgb(css: string): [number, number, number] {
  const parts = css.match(/\d+/g);
  if (!parts || parts.length !== 3) {
    throw new Error(`expected an "rgb(r, g, b)" string, got ${css}`);
  }
  const [r, g, b] = parts.map(Number);
  return [r ?? 0, g ?? 0, b ?? 0];
}

describe("mixColor", () => {
  it("renders near-black for zero amplitude in both channels", () => {
    expect(mixColor(0, 0)).toBe("rgb(10, 15, 15)");
  });

  it("biases green for a pure signal/noise amplitude", () => {
    const [r, g, b] = parseRgb(mixColor(1, 0));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("biases red+green (amber) for a pure decoy amplitude", () => {
    const [r, g, b] = parseRgb(mixColor(0, 1));
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it("clamps out-of-range inputs instead of producing invalid channel values", () => {
    const [r, g, b] = parseRgb(mixColor(5, -5));
    for (const channel of [r, g, b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });
});
