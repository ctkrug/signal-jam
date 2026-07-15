import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mixColor, Waterfall } from "../src/waterfall";

function parseRgb(css: string): [number, number, number] {
  const parts = css.match(/\d+/g);
  if (!parts || parts.length !== 3) {
    throw new Error(`expected an "rgb(r, g, b)" string, got ${css}`);
  }
  const [r, g, b] = parts.map(Number);
  return [r ?? 0, g ?? 0, b ?? 0];
}

function fakeContext(): CanvasRenderingContext2D {
  return {
    fillStyle: "",
    fillRect: vi.fn(),
    // Real browsers throw an IndexSizeError for a zero/negative source or
    // destination dimension — mirrored here (drawImage(img, sx, sy,
    // sWidth, sHeight, dx, dy, dWidth, dHeight)) so a missing width/height
    // guard in pushRow() actually fails this suite instead of passing
    // silently against an overly permissive mock.
    drawImage: vi.fn((_img, _sx, _sy, sWidth, sHeight, _dx, _dy, dWidth, dHeight) => {
      if ([sWidth, sHeight, dWidth, dHeight].some((d) => d <= 0)) {
        throw new DOMException("source or destination has width or height of 0", "IndexSizeError");
      }
    }),
  } as unknown as CanvasRenderingContext2D;
}

function stubCanvasRect(canvas: HTMLCanvasElement, width: number, height: number): void {
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    width,
    height,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => "",
  });
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

describe("Waterfall", () => {
  let getContextSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => fakeContext());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws a clear error when a 2D context is unavailable", () => {
    getContextSpy.mockImplementation(() => null);
    const canvas = document.createElement("canvas");
    stubCanvasRect(canvas, 400, 200);
    expect(() => new Waterfall(canvas)).toThrow(/2D canvas context unavailable/);
  });

  it("sizes the backing store to devicePixelRatio on construction", () => {
    const canvas = document.createElement("canvas");
    stubCanvasRect(canvas, 400, 200);
    vi.stubGlobal("devicePixelRatio", 2);
    new Waterfall(canvas);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(400);
  });

  it("resize() is a no-op when the backing store already matches", () => {
    const canvas = document.createElement("canvas");
    stubCanvasRect(canvas, 400, 200);
    vi.stubGlobal("devicePixelRatio", 1);
    const waterfall = new Waterfall(canvas);
    const widthBefore = canvas.width;
    const heightBefore = canvas.height;

    waterfall.resize(); // same rect, same DPR — should return early
    expect(canvas.width).toBe(widthBefore);
    expect(canvas.height).toBe(heightBefore);
  });

  it("resize() picks up a new size after the layout changes", () => {
    const canvas = document.createElement("canvas");
    stubCanvasRect(canvas, 400, 200);
    const waterfall = new Waterfall(canvas);

    stubCanvasRect(canvas, 800, 300);
    waterfall.resize();
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(300);
  });

  it("resize() clamps a zero-size layout to a 1x1 backing store, not zero", () => {
    const canvas = document.createElement("canvas");
    stubCanvasRect(canvas, 0, 0);
    const waterfall = new Waterfall(canvas);
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);

    waterfall.reset();
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
  });

  it("pushRow() is a no-op on a zero-width canvas instead of throwing", () => {
    const canvas = document.createElement("canvas");
    stubCanvasRect(canvas, 400, 200);
    const waterfall = new Waterfall(canvas);

    // resize()'s Math.max(1, ...) clamp means the constructor can never
    // leave the canvas at zero width — reaching that guard requires an
    // external zero-out (e.g. a stylesheet failing to load mid-layout),
    // forced directly since `width`/`height` are plain settable
    // attributes. Width specifically (not height) is what feeds
    // drawImage's sWidth/dWidth, which real canvases reject at zero.
    canvas.width = 0;

    expect(() =>
      waterfall.pushRow({
        cursorFrequency: 0.5,
        signal: { frequency: 0.5, dutyCycle: 0.5 },
        decoys: [],
      }),
    ).not.toThrow();
  });

  it("reset() repaints the backing store", () => {
    const canvas = document.createElement("canvas");
    stubCanvasRect(canvas, 400, 200);
    const waterfall = new Waterfall(canvas);
    waterfall.reveal();

    const ctx = getContextSpy.mock.results[0]?.value as { fillRect: ReturnType<typeof vi.fn> };
    ctx.fillRect.mockClear();
    waterfall.reset();
    expect(ctx.fillRect).toHaveBeenCalled();
  });
});
