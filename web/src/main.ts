import init, { PuzzleSession } from "./wasm/signal_jam_core.js";
import { getUtcDateString } from "./date";
import { Waterfall } from "./waterfall";
import { SfxPlayer } from "./audio";
import { findHoveredEmitter } from "./spectrum";

/** Day 1 of the puzzle calendar; the day counter is days since this date. */
const LAUNCH_DATE_UTC_MS = Date.UTC(2026, 6, 15);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const KEYBOARD_STEP = 0.01;

interface EmitterInfo {
  frequency: number;
  dutyCycle: number;
  noiseFloor: number;
}

type Mismatch = "dutyCycle" | "noiseFloor";

interface DecoyInfo extends EmitterInfo {
  mismatch: Mismatch;
}

interface PuzzleInfo {
  date: string;
  sweepBudget: number;
  lockTolerance: number;
  decoyTolerance: number;
  signal: EmitterInfo;
  decoys: DecoyInfo[];
}

const MISMATCH_LABEL: Record<Mismatch, string> = {
  dutyCycle: "duty cycle",
  noiseFloor: "noise floor",
};

/** Human-readable clue text for a decoy's revealed mismatch property. */
export function formatHint(decoyNumber: number, mismatch: Mismatch): string {
  return `DECOY ${decoyNumber} — ${MISMATCH_LABEL[mismatch]} doesn't match`;
}

type SweepEventJson =
  | { kind: "none" }
  | { kind: "decoyHit"; index: number }
  | { kind: "locked"; frequency: number }
  | { kind: "exhausted" }
  | { kind: "ignored" };

/** Day number (1-indexed) for the puzzle calendar, given a UTC date string. */
export function dayNumber(utcDateString: string): number {
  const ms = Date.parse(`${utcDateString}T00:00:00Z`);
  if (Number.isNaN(ms)) return 1;
  return Math.max(1, Math.round((ms - LAUNCH_DATE_UTC_MS) / MS_PER_DAY) + 1);
}

export type SweepOutcome = "decoy" | "lock";

/**
 * Builds a Wordle-shaped share string: one square per sweep event in
 * order (🟧 decoy, 🟩 lock), padded with ⬛ up to the sweep budget plus
 * the winning square, then a numeric summary line. Never encodes the
 * signal's actual frequency or duty cycle/noise floor — only outcomes.
 */
export function buildShareText(day: number, outcomes: SweepOutcome[], sweepBudget: number): string {
  const squares = outcomes.map((o) => (o === "decoy" ? "🟧" : "🟩")).join("");
  const totalSlots = sweepBudget + 1;
  const padding = "⬛".repeat(Math.max(0, totalSlots - outcomes.length));
  const used = outcomes.filter((o) => o === "decoy").length;
  return `Signal Jam Day ${day}\n${squares}${padding}\n${used}/${sweepBudget} sweeps`;
}

/**
 * Writes `text` to the clipboard, preferring the async Clipboard API and
 * falling back to a legacy `execCommand("copy")` off-screen textarea for
 * environments without it. Resolves `false` (never throws) on failure.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy fallback below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

/** Renders a normalized [0,1] frequency as a flavorful "dial" reading. */
export function formatFrequencyReadout(frequency: number | null): string {
  if (frequency === null) return "– – –";
  const mhz = 88 + frequency * 20;
  return `${mhz.toFixed(2)} MHz`;
}

/** Renders a [0,1] property value as a "%" readout, or a blank state for null. */
export function formatPercentReadout(value: number | null): string {
  if (value === null) return "– –";
  return `${Math.round(value * 100)}%`;
}

/** Maps a pointer's clientX onto a normalized [0,1] frequency for `trackRect`. */
export function frequencyFromPosition(trackRect: { left: number; width: number }, clientX: number): number {
  if (trackRect.width <= 0) return 0;
  const ratio = (clientX - trackRect.left) / trackRect.width;
  return Math.min(1, Math.max(0, ratio));
}

function requireElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`expected #${id} to exist in the app shell`);
  }
  return el as T;
}

async function bootstrap(): Promise<void> {
  const dayCounterEl = requireElement<HTMLElement>("day-counter");
  const ledEl = requireElement<HTMLElement>("win-led");
  const canvasEl = requireElement<HTMLCanvasElement>("waterfall");
  const chassisEl = document.querySelector<HTMLElement>(".chassis");
  const sweepTrackEl = requireElement<HTMLElement>("sweep-track");
  const cursorEl = requireElement<HTMLElement>("sweep-cursor");
  const hintsPanelEl = requireElement<HTMLElement>("hints-panel");
  const hintsListEl = requireElement<HTMLElement>("hints-list");
  const sweepsValueEl = requireElement<HTMLElement>("sweeps-value");
  const freqValueEl = requireElement<HTMLElement>("freq-value");
  const dutyValueEl = requireElement<HTMLElement>("duty-value");
  const noiseValueEl = requireElement<HTMLElement>("noise-value");
  const muteButtonEl = requireElement<HTMLButtonElement>("mute-button");
  const statusLiveEl = requireElement<HTMLElement>("status-live");
  const overlayEl = requireElement<HTMLElement>("result-overlay");
  const overlayTitleEl = requireElement<HTMLElement>("overlay-title");
  const overlayBodyEl = requireElement<HTMLElement>("overlay-body");
  const overlayActionEl = requireElement<HTMLButtonElement>("overlay-action");
  const overlayShareEl = requireElement<HTMLButtonElement>("overlay-share");

  const announce = (message: string): void => {
    statusLiveEl.textContent = message;
  };

  try {
    await init();

    const date = getUtcDateString();
    const session = new PuzzleSession(date);
    const info = JSON.parse(session.puzzleInfo()) as PuzzleInfo;
    const waterfall = new Waterfall(canvasEl);
    const sfx = new SfxPlayer();

    dayCounterEl.textContent = `DAY ${dayNumber(date)}`;
    sweepsValueEl.textContent = String(info.sweepBudget);
    freqValueEl.textContent = formatFrequencyReadout(null);
    dutyValueEl.textContent = formatPercentReadout(null);
    noiseValueEl.textContent = formatPercentReadout(null);
    muteButtonEl.setAttribute("aria-pressed", String(sfx.isMuted));

    let cursorFrequency: number | null = null;
    let resultShown = false;

    const closeOverlay = (): void => {
      overlayEl.hidden = true;
    };

    const showOverlay = (opts: {
      title: string;
      body: string;
      actionLabel: string;
      lossVariant: boolean;
      shareText?: string;
    }): void => {
      overlayTitleEl.textContent = opts.title;
      overlayTitleEl.classList.toggle("loss", opts.lossVariant);
      overlayBodyEl.textContent = opts.body;
      overlayActionEl.textContent = opts.actionLabel;
      overlayShareEl.hidden = opts.shareText === undefined;
      overlayShareEl.textContent = "Copy result";
      overlayEl.hidden = false;
      overlayActionEl.focus();

      if (opts.shareText !== undefined) {
        const shareText = opts.shareText;
        overlayShareEl.onclick = () => {
          void copyToClipboard(shareText).then((copied) => {
            if (!copied) return;
            overlayShareEl.textContent = "Copied!";
            window.setTimeout(() => {
              overlayShareEl.textContent = "Copy result";
            }, 2000);
          });
        };
      }
    };

    const sweepOutcomes: SweepOutcome[] = [];

    const revealedHints = new Set<number>();

    const revealHint = (index: number): void => {
      if (revealedHints.has(index)) return;
      revealedHints.add(index);

      const decoy = info.decoys[index];
      if (!decoy) return;

      const chip = document.createElement("li");
      chip.className = "hint-chip";
      chip.textContent = formatHint(index + 1, decoy.mismatch);
      hintsListEl.appendChild(chip);
      hintsPanelEl.classList.add("has-hints");
    };

    const onDecoyHit = (index: number): void => {
      sweepOutcomes.push("decoy");
      cursorEl.classList.add("hit-decoy");
      chassisEl?.classList.add("shake");
      sfx.decoyBump();
      revealHint(index);
      announce(`Decoy detected. One sweep used, ${session.sweepsRemaining()} remaining.`);
      window.setTimeout(() => cursorEl.classList.remove("hit-decoy"), 160);
      window.setTimeout(() => chassisEl?.classList.remove("shake"), 90);
    };

    const onLocked = (): void => {
      resultShown = true;
      sweepOutcomes.push("lock");
      cursorEl.classList.remove("hit-decoy");
      cursorEl.classList.add("locked");
      waterfall.markLocked();
      sfx.flareLock();
      ledEl.classList.add("won");
      const used = info.sweepBudget - session.sweepsRemaining();
      announce("Signal locked.");
      showOverlay({
        title: "SIGNAL LOCKED",
        lossVariant: false,
        body: `You locked the signal using ${used} of ${info.sweepBudget} sweeps.`,
        actionLabel: "Nice.",
        shareText: buildShareText(dayNumber(date), sweepOutcomes, info.sweepBudget),
      });
    };

    const onExhausted = (): void => {
      resultShown = true;
      sfx.loseTone();
      announce("Out of sweeps. Signal not found.");
      showOverlay({
        title: "OUT OF SWEEPS",
        lossVariant: true,
        body: `The signal was at ${formatFrequencyReadout(info.signal.frequency)}. Come back tomorrow for a new puzzle.`,
        actionLabel: "Close",
      });
    };

    const updateFrequency = (frequency: number): void => {
      // Once the puzzle has ended, freeze the cursor exactly where it
      // is (locked on the signal, or wherever it ran out of sweeps)
      // rather than letting further drag/keyboard input drift it.
      if (resultShown) return;

      cursorFrequency = frequency;
      cursorEl.style.left = `${frequency * 100}%`;
      sweepTrackEl.setAttribute("aria-valuenow", String(Math.round(frequency * 100)));
      freqValueEl.textContent = formatFrequencyReadout(frequency);
      sfx.sweepTick(frequency);

      const event = JSON.parse(session.sweep(frequency)) as SweepEventJson;
      sweepsValueEl.textContent = String(session.sweepsRemaining());
      sweepsValueEl.classList.toggle("critical", session.sweepsRemaining() <= 1);

      switch (event.kind) {
        case "decoyHit":
          onDecoyHit(event.index);
          if (session.isExhausted()) onExhausted();
          break;
        case "locked":
          // Snap the cursor to the signal's exact frequency rather than
          // wherever inside the lock tolerance the pointer happened to be.
          cursorFrequency = event.frequency;
          cursorEl.style.left = `${event.frequency * 100}%`;
          freqValueEl.textContent = formatFrequencyReadout(event.frequency);
          onLocked();
          break;
        case "exhausted":
          onExhausted();
          break;
        default:
          break;
      }
    };

    let dragging = false;
    sweepTrackEl.addEventListener("pointerdown", (e) => {
      dragging = true;
      sweepTrackEl.setPointerCapture(e.pointerId);
      updateFrequency(frequencyFromPosition(sweepTrackEl.getBoundingClientRect(), e.clientX));
    });
    sweepTrackEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      updateFrequency(frequencyFromPosition(sweepTrackEl.getBoundingClientRect(), e.clientX));
    });
    window.addEventListener("pointerup", () => {
      dragging = false;
    });
    sweepTrackEl.addEventListener("pointercancel", () => {
      dragging = false;
    });

    sweepTrackEl.addEventListener("keydown", (e) => {
      let next = cursorFrequency ?? 0.5;
      if (e.key === "ArrowLeft") next -= KEYBOARD_STEP;
      else if (e.key === "ArrowRight") next += KEYBOARD_STEP;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = 1;
      else return;
      e.preventDefault();
      updateFrequency(Math.min(1, Math.max(0, next)));
    });

    muteButtonEl.addEventListener("click", () => {
      const muted = sfx.toggleMuted();
      muteButtonEl.setAttribute("aria-pressed", String(muted));
    });

    overlayActionEl.addEventListener("click", closeOverlay);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlayEl.hidden) closeOverlay();
    });

    window.addEventListener("resize", () => waterfall.resize());

    const frameLoop = (): void => {
      waterfall.pushRow({
        cursorFrequency,
        signal: { frequency: info.signal.frequency, dutyCycle: info.signal.dutyCycle },
        decoys: info.decoys.map((d) => ({ frequency: d.frequency, dutyCycle: d.dutyCycle })),
      });

      const hovered = findHoveredEmitter(cursorFrequency, info.signal, info.decoys);
      dutyValueEl.textContent = formatPercentReadout(hovered?.dutyCycle ?? null);
      noiseValueEl.textContent = formatPercentReadout(hovered?.noiseFloor ?? null);

      requestAnimationFrame(frameLoop);
    };
    requestAnimationFrame(frameLoop);
  } catch (err) {
    console.error(err);
    dayCounterEl.textContent = "OFFLINE";
    sweepTrackEl.setAttribute("aria-disabled", "true");
    announce("Signal core failed to load. Reload the page to try again.");
  }
}

void bootstrap();
