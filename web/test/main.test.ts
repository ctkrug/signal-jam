import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakePuzzleSession {
  private locked = false;
  private exhausted = false;
  private remaining = 4;

  constructor(public date: string) {}

  puzzleInfo(): string {
    return JSON.stringify({
      date: this.date,
      sweepBudget: 4,
      lockTolerance: 0.012,
      decoyTolerance: 0.015,
      signal: { frequency: 0.5, dutyCycle: 0.6, noiseFloor: 0.7 },
      decoys: [{ frequency: 0.2, dutyCycle: 0.3, noiseFloor: 0.2, mismatch: "dutyCycle" }],
    });
  }

  sweep(frequency: number): string {
    if (this.locked) return JSON.stringify({ kind: "ignored" });
    if (this.exhausted) return JSON.stringify({ kind: "exhausted" });

    if (Math.abs(frequency - 0.5) <= 0.012) {
      this.locked = true;
      return JSON.stringify({ kind: "locked", frequency: 0.5 });
    }
    if (Math.abs(frequency - 0.2) <= 0.015) {
      this.remaining -= 1;
      if (this.remaining <= 0) this.exhausted = true;
      return JSON.stringify({ kind: "decoyHit", index: 0 });
    }
    return JSON.stringify({ kind: "none" });
  }

  isLocked(): boolean {
    return this.locked;
  }

  isExhausted(): boolean {
    return this.exhausted;
  }

  sweepsRemaining(): number {
    return this.remaining;
  }
}

vi.mock("../src/wasm/signal_jam_core.js", () => ({
  default: async () => {},
  PuzzleSession: FakePuzzleSession,
}));

const APP_SHELL = `
<div id="app">
  <header class="console-header">
    <div class="wordmark-wrap">
      <span class="led" id="win-led"></span>
      <h1 class="wordmark">SIGNAL JAM</h1>
    </div>
    <div class="day-counter" id="day-counter">DAY —</div>
  </header>
  <main class="chassis">
    <div class="waterfall-frame">
      <canvas id="waterfall"></canvas>
    </div>
    <div class="hints-panel" id="hints-panel">
      <p class="hints-empty" id="hints-empty"></p>
      <ul class="hints-list" id="hints-list"></ul>
    </div>
    <section class="control-strip">
      <div id="sweep-track" class="sweep-track" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="sweep-cursor" id="sweep-cursor"></div>
      </div>
      <div class="readout-row">
        <div class="readout"><span class="readout-value" id="sweeps-value">–</span></div>
        <div class="readout"><span class="readout-value" id="freq-value">– – –</span></div>
        <div class="readout"><span class="readout-value" id="duty-value">– –</span></div>
        <div class="readout"><span class="readout-value" id="noise-value">– –</span></div>
        <button id="mute-button" class="icon-button" type="button" aria-pressed="false">
          <span class="icon-speaker"></span>
        </button>
      </div>
    </section>
  </main>
  <p id="status-live" role="status"></p>
  <div class="overlay" id="result-overlay" hidden>
    <div class="overlay-card">
      <h2 id="overlay-title"></h2>
      <p id="overlay-body"></p>
      <p id="overlay-countdown" hidden></p>
      <button id="overlay-share" class="secondary-button" type="button" hidden></button>
      <button id="overlay-action" class="primary-button" type="button"></button>
    </div>
  </div>
</div>`;

function stubTrackRect(): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 50,
    right: 200,
    bottom: 50,
    x: 0,
    y: 0,
    toJSON: () => "",
  });
}

beforeEach(() => {
  document.body.innerHTML = APP_SHELL;
  localStorage.clear();
  stubTrackRect();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillStyle: "",
    fillRect: () => {},
    drawImage: () => {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  Element.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("bootstrap", () => {
  it("initializes the console: day counter, sweeps readout, and mute state", async () => {
    await import("../src/main.ts");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById("day-counter")?.textContent).toMatch(/^DAY \d+$/);
    expect(document.getElementById("sweeps-value")?.textContent).toBe("4");
    expect(document.getElementById("mute-button")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("locking the signal shows the win overlay and lights the LED", async () => {
    await import("../src/main.ts");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const track = document.getElementById("sweep-track")!;
    track.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 100, pointerId: 1, bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById("result-overlay")?.hidden).toBe(false);
    expect(document.getElementById("overlay-title")?.textContent).toBe("SIGNAL LOCKED");
    expect(document.getElementById("win-led")?.classList.contains("won")).toBe(true);
  });

  it("winning reveals a share button that copies the result and confirms briefly", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    await import("../src/main.ts");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const track = document.getElementById("sweep-track")!;
    track.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 100, pointerId: 1, bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const shareButton = document.getElementById("overlay-share") as HTMLButtonElement;
    expect(shareButton.hidden).toBe(false);

    shareButton.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Signal Jam Day"));
    expect(shareButton.textContent).toBe("Copied!");
  });

  it("hitting a decoy without winning keeps the share button hidden", async () => {
    await import("../src/main.ts");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const track = document.getElementById("sweep-track")!;
    track.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 40, pointerId: 1, bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById("overlay-share")?.hidden).toBe(true);
  });

  it("hitting a decoy flashes the cursor and decrements the sweeps readout", async () => {
    await import("../src/main.ts");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const track = document.getElementById("sweep-track")!;
    // frequency 0.2 * 200px width = 40px
    track.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 40, pointerId: 1, bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.getElementById("sweeps-value")?.textContent).toBe("3");
    expect(document.getElementById("sweep-cursor")?.classList.contains("hit-decoy")).toBe(true);
  });

  it("hitting a decoy reveals its mismatch property as a hint chip, once", async () => {
    await import("../src/main.ts");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const track = document.getElementById("sweep-track")!;
    track.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 40, pointerId: 1, bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Re-cross the same already-spent decoy — must not duplicate the hint.
    track.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 180, pointerId: 1, bubbles: true }),
    );
    track.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 40, pointerId: 1, bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const chips = document.querySelectorAll("#hints-list .hint-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toContain("duty cycle");
    expect(document.getElementById("hints-panel")?.classList.contains("has-hints")).toBe(true);
  });

  it("live readout shows the hovered emitter's duty/noise and blanks over open noise", async () => {
    await import("../src/main.ts");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const track = document.getElementById("sweep-track")!;

    // 0.53 * 200px — near the signal (0.5) but outside its lock tolerance.
    track.dispatchEvent(
      new PointerEvent("pointerdown", { clientX: 106, pointerId: 1, bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.getElementById("duty-value")?.textContent).toBe("60%");
    expect(document.getElementById("noise-value")?.textContent).toBe("70%");

    // 0.23 * 200px — near the decoy (0.2) but outside its hit tolerance.
    track.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 46, pointerId: 1, bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.getElementById("duty-value")?.textContent).toBe("30%");
    expect(document.getElementById("noise-value")?.textContent).toBe("20%");

    // 0.65 * 200px — open noise, away from every emitter's reveal radius.
    track.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 130, pointerId: 1, bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.getElementById("duty-value")?.textContent).toBe("– –");
    expect(document.getElementById("noise-value")?.textContent).toBe("– –");
  });
});

describe("pure helpers", () => {
  it("dayNumber counts up from the launch date, never below 1", async () => {
    const { dayNumber } = await import("../src/main.ts");
    expect(dayNumber("2026-07-15")).toBe(1);
    expect(dayNumber("2026-07-16")).toBe(2);
    expect(dayNumber("2020-01-01")).toBe(1); // before launch clamps to day 1
  });

  it("formatFrequencyReadout renders a placeholder for null and a reading otherwise", async () => {
    const { formatFrequencyReadout } = await import("../src/main.ts");
    expect(formatFrequencyReadout(null)).toBe("– – –");
    expect(formatFrequencyReadout(0)).toBe("88.00 MHz");
    expect(formatFrequencyReadout(1)).toBe("108.00 MHz");
  });

  it("formatHint labels the decoy number and its mismatched property", async () => {
    const { formatHint } = await import("../src/main.ts");
    expect(formatHint(1, "dutyCycle")).toBe("DECOY 1 — duty cycle doesn't match");
    expect(formatHint(3, "noiseFloor")).toBe("DECOY 3 — noise floor doesn't match");
  });

  it("buildShareText renders squares in outcome order, padded to sweepBudget + 1", async () => {
    const { buildShareText } = await import("../src/main.ts");
    expect(buildShareText(5, ["decoy", "lock"], 4)).toBe(
      "Signal Jam Day 5\n🟧🟩⬛⬛⬛\n1/4 sweeps",
    );
  });

  it("buildShareText handles an immediate lock with zero decoy hits", async () => {
    const { buildShareText } = await import("../src/main.ts");
    expect(buildShareText(1, ["lock"], 4)).toBe("Signal Jam Day 1\n🟩⬛⬛⬛⬛\n0/4 sweeps");
  });

  it("buildShareText adds no padding when every sweep slot was used", async () => {
    const { buildShareText } = await import("../src/main.ts");
    expect(buildShareText(9, ["decoy", "decoy", "decoy", "decoy", "lock"], 4)).toBe(
      "Signal Jam Day 9\n🟧🟧🟧🟧🟩\n4/4 sweeps",
    );
  });

  it("buildShareText never leaks the signal's actual frequency/duty/noise", async () => {
    const { buildShareText } = await import("../src/main.ts");
    const text = buildShareText(2, ["decoy", "lock"], 4);
    expect(text).not.toMatch(/\d+\.\d+\s*MHz/);
  });

  it("copyToClipboard uses the async Clipboard API when available", async () => {
    const { copyToClipboard } = await import("../src/main.ts");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("copyToClipboard falls back to execCommand when the Clipboard API is unavailable", async () => {
    const { copyToClipboard } = await import("../src/main.ts");
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("copyToClipboard resolves false instead of throwing when every path fails", async () => {
    const { copyToClipboard } = await import("../src/main.ts");
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = vi.fn(() => {
      throw new Error("denied");
    });

    await expect(copyToClipboard("hello")).resolves.toBe(false);
  });

  it("formatPercentReadout renders a percentage or a blank state for null", async () => {
    const { formatPercentReadout } = await import("../src/main.ts");
    expect(formatPercentReadout(null)).toBe("– –");
    expect(formatPercentReadout(0)).toBe("0%");
    expect(formatPercentReadout(0.6)).toBe("60%");
    expect(formatPercentReadout(1)).toBe("100%");
  });

  it("frequencyFromPosition clamps to [0, 1] and handles a zero-width track", async () => {
    const { frequencyFromPosition } = await import("../src/main.ts");
    const rect = { left: 100, width: 200 };
    expect(frequencyFromPosition(rect, 100)).toBe(0);
    expect(frequencyFromPosition(rect, 300)).toBe(1);
    expect(frequencyFromPosition(rect, 200)).toBe(0.5);
    expect(frequencyFromPosition(rect, -50)).toBe(0); // before the track, clamps
    expect(frequencyFromPosition(rect, 1000)).toBe(1); // past the track, clamps
    expect(frequencyFromPosition({ left: 0, width: 0 }, 50)).toBe(0);
  });
});
