import { describe, expect, it } from "vitest";
import { mixColor } from "../src/waterfall";

describe("mixColor", () => {
  it("renders near-black for zero amplitude in both channels", () => {
    expect(mixColor(0, 0)).toBe("rgb(10, 15, 15)");
  });

  it("biases green for a pure signal/noise amplitude", () => {
    const [r, g, b] = mixColor(1, 0).match(/\d+/g)!.map(Number);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("biases red+green (amber) for a pure decoy amplitude", () => {
    const [r, g, b] = mixColor(0, 1).match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it("clamps out-of-range inputs instead of producing invalid channel values", () => {
    const [r, g, b] = mixColor(5, -5).match(/\d+/g)!.map(Number);
    for (const channel of [r, g, b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });
});
