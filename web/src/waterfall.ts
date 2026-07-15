import { computeRowAmplitudes, type EmitterVis } from "./spectrum";

const BIN_COUNT = 160;

/** Mixes a bin's green (signal/noise) and amber (decoy) channels into an RGB fill style. */
export function mixColor(green: number, amber: number): string {
  const g = Math.max(0, Math.min(1, green));
  const a = Math.max(0, Math.min(1, amber));
  const r = Math.min(255, Math.round(10 + g * 40 + a * 255));
  const gr = Math.min(255, Math.round(15 + g * 255 + a * 170));
  const b = Math.min(255, Math.round(15 + g * 90 + a * 40));
  return `rgb(${r}, ${gr}, ${b})`;
}

export interface WaterfallRowInput {
  cursorFrequency: number | null;
  signal: EmitterVis;
  decoys: EmitterVis[];
}

/**
 * Owns the waterfall `<canvas>`: sizes it to devicePixelRatio, scrolls
 * the existing image up by one pixel row each frame, and paints the new
 * row from the current sweep position via computeRowAmplitudes.
 */
export class Waterfall {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly binCount: number;
  private locked = false;

  constructor(canvas: HTMLCanvasElement, binCount = BIN_COUNT) {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context unavailable");
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.binCount = binCount;
    this.resize();
  }

  /** Resizes the backing store to match the element's CSS size at current DPR. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width === width && this.canvas.height === height) {
      return;
    }
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.fillStyle = "#060908";
    this.ctx.fillRect(0, 0, width, height);
  }

  /** Marks the signal as locked: future rows render its bump full-bright. */
  markLocked(): void {
    this.locked = true;
  }

  reset(): void {
    this.locked = false;
    this.resize();
    this.ctx.fillStyle = "#060908";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Paints one new row at the bottom, scrolling prior history up. */
  pushRow(input: WaterfallRowInput): void {
    const { width, height } = this.canvas;
    if (width === 0 || height === 0) {
      return;
    }

    if (height > 1) {
      this.ctx.drawImage(this.canvas, 0, 1, width, height - 1, 0, 0, width, height - 1);
    }

    const { green, amber } = computeRowAmplitudes(
      { ...input, binCount: this.binCount, locked: this.locked },
      () => Math.random() * 0.05 + 0.015,
    );

    const binWidth = width / this.binCount;
    for (let bin = 0; bin < this.binCount; bin++) {
      this.ctx.fillStyle = mixColor(green[bin] ?? 0, amber[bin] ?? 0);
      const x = Math.floor(bin * binWidth);
      const w = Math.ceil(binWidth) + 1;
      this.ctx.fillRect(x, height - 1, w, 1);
    }
  }
}
