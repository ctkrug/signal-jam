import init, { PuzzleSession } from "./wasm/signal_jam_core.js";
import { formatCountdown, getUtcDateString, msUntilNextUtcDay } from "./date";
import { Waterfall } from "./waterfall";
import { SfxPlayer } from "./audio";
import { findHoveredEmitter } from "./spectrum";
import {
  activeStreak,
  loadResult,
  nextStreak,
  previousUtcDateString,
  saveResult,
  type DailyResult,
  type SweepOutcome,
} from "./storage";

/** Day 1 of the puzzle calendar; the day counter is days since this date. */
const LAUNCH_DATE_UTC_MS = Date.UTC(2026, 6, 15);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const KEYBOARD_STEP = 0.01;
const LOCK_SPARK_COUNT = 8;
const LOCK_CELEBRATION_LIFETIME_MS = 700;

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

/** Whether the user has asked the OS to minimize non-essential motion. */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Fires the win flourish at the locked frequency: a phosphor pulse ring
 * plus a radial spark burst, both positioned on the sweep track at
 * `leftPercent`. Purely decorative and skipped entirely under
 * `prefers-reduced-motion`; each node self-removes so nothing leaks.
 */
export function spawnLockCelebration(track: HTMLElement, leftPercent: number): void {
  if (prefersReducedMotion()) return;

  const removeAfterLifetime = (node: HTMLElement): void => {
    window.setTimeout(() => node.remove(), LOCK_CELEBRATION_LIFETIME_MS);
  };

  const ring = document.createElement("div");
  ring.className = "lock-pulse";
  ring.style.left = `${leftPercent}%`;
  ring.setAttribute("aria-hidden", "true");
  track.appendChild(ring);
  removeAfterLifetime(ring);

  for (let i = 0; i < LOCK_SPARK_COUNT; i++) {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.left = `${leftPercent}%`;
    spark.style.setProperty("--angle", `${(i / LOCK_SPARK_COUNT) * 360}deg`);
    spark.setAttribute("aria-hidden", "true");
    track.appendChild(spark);
    removeAfterLifetime(spark);
  }
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
  const streakCounterEl = requireElement<HTMLElement>("streak-counter");
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
  const overlayCountdownEl = requireElement<HTMLElement>("overlay-countdown");
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

    const yesterdayResult = loadResult(previousUtcDateString(date));
    const todayResult = loadResult(date);

    const updateStreakBadge = (streak: number): void => {
      streakCounterEl.hidden = streak <= 0;
      streakCounterEl.textContent = `STREAK ${streak}`;
    };

    dayCounterEl.textContent = `DAY ${dayNumber(date)}`;
    updateStreakBadge(activeStreak(todayResult, yesterdayResult));
    sweepsValueEl.textContent = String(info.sweepBudget);
    freqValueEl.textContent = formatFrequencyReadout(null);
    dutyValueEl.textContent = formatPercentReadout(null);
    noiseValueEl.textContent = formatPercentReadout(null);
    muteButtonEl.setAttribute("aria-pressed", String(sfx.isMuted));

    let cursorFrequency: number | null = null;
    let resultShown = false;

    let countdownIntervalId: ReturnType<typeof window.setInterval> | null = null;

    const stopCountdown = (): void => {
      if (countdownIntervalId !== null) {
        window.clearInterval(countdownIntervalId);
        countdownIntervalId = null;
      }
      overlayCountdownEl.hidden = true;
    };

    const startCountdown = (): void => {
      const tick = (): void => {
        overlayCountdownEl.textContent = `Next puzzle in ${formatCountdown(msUntilNextUtcDay())}`;
      };
      overlayCountdownEl.hidden = false;
      tick();
      countdownIntervalId = window.setInterval(tick, 1000);
    };

    const closeOverlay = (): void => {
      overlayEl.hidden = true;
      stopCountdown();
    };

    const showOverlay = (opts: {
      title: string;
      body: string;
      actionLabel: string;
      lossVariant: boolean;
      shareText?: string;
      showCountdown?: boolean;
    }): void => {
      overlayTitleEl.textContent = opts.title;
      overlayTitleEl.classList.toggle("loss", opts.lossVariant);
      overlayBodyEl.textContent = opts.body;
      overlayActionEl.textContent = opts.actionLabel;
      overlayShareEl.hidden = opts.shareText === undefined;
      overlayShareEl.textContent = "Copy result";
      overlayEl.hidden = false;
      overlayActionEl.focus();

      if (opts.showCountdown) {
        startCountdown();
      } else {
        stopCountdown();
      }

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
      waterfall.reveal();
      sfx.flareLock();
      sfx.winJingle();
      spawnLockCelebration(sweepTrackEl, (cursorFrequency ?? info.signal.frequency) * 100);
      ledEl.classList.add("won");
      const used = info.sweepBudget - session.sweepsRemaining();
      const streak = nextStreak(yesterdayResult, true);
      saveResult(date, {
        won: true,
        sweepsUsed: used,
        sweepBudget: info.sweepBudget,
        outcomes: sweepOutcomes,
        streak,
      });
      updateStreakBadge(streak);
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
      waterfall.reveal();
      sfx.loseTone();
      const streak = nextStreak(yesterdayResult, false);
      saveResult(date, {
        won: false,
        sweepsUsed: info.sweepBudget - session.sweepsRemaining(),
        sweepBudget: info.sweepBudget,
        outcomes: sweepOutcomes,
        streak,
      });
      updateStreakBadge(streak);
      announce("Out of sweeps. Signal not found.");
      showOverlay({
        title: "OUT OF SWEEPS",
        lossVariant: true,
        body: `The signal was at ${formatFrequencyReadout(info.signal.frequency)}.`,
        actionLabel: "Close",
        showCountdown: true,
      });
    };

    /** Reconstructs today's already-completed result on a same-day reload. */
    const restoreCompletedResult = (result: DailyResult): void => {
      resultShown = true;
      cursorFrequency = info.signal.frequency;
      cursorEl.style.left = `${info.signal.frequency * 100}%`;
      cursorEl.classList.add(result.won ? "locked" : "hit-decoy");
      freqValueEl.textContent = formatFrequencyReadout(info.signal.frequency);
      sweepsValueEl.textContent = String(result.sweepBudget - result.sweepsUsed);
      sweepTrackEl.setAttribute("aria-disabled", "true");
      waterfall.reveal();

      if (result.won) {
        ledEl.classList.add("won");
        announce("You already locked today's signal.");
        showOverlay({
          title: "SIGNAL LOCKED",
          lossVariant: false,
          body: `You locked the signal using ${result.sweepsUsed} of ${result.sweepBudget} sweeps.`,
          actionLabel: "Nice.",
          shareText: buildShareText(dayNumber(date), result.outcomes, result.sweepBudget),
        });
      } else {
        announce("You already ran out of sweeps today.");
        showOverlay({
          title: "OUT OF SWEEPS",
          lossVariant: true,
          body: `The signal was at ${formatFrequencyReadout(info.signal.frequency)}.`,
          actionLabel: "Close",
          showCountdown: true,
        });
      }
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

    if (todayResult) {
      restoreCompletedResult(todayResult);
    }

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
