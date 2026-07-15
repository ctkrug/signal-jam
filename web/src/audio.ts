/**
 * Synth SFX via WebAudio — oscillators/noise only, no audio files. The
 * AudioContext is created lazily (first call after a user gesture, per
 * autoplay policy) and every method no-ops if WebAudio is unavailable,
 * so this is safe to call from any environment including tests.
 */

const MUTE_STORAGE_KEY = "signal-jam:muted";
const SWEEP_TICK_MIN_INTERVAL_MS = 70;

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & { webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function readStoredMute(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    // Storage unavailable (private browsing, test env) — default unmuted
    // and simply don't persist the toggle for this session.
    return false;
  }
}

function writeStoredMute(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // Same as above: persistence is best-effort, not required to function.
  }
}

export class SfxPlayer {
  private ctx: AudioContext | null = null;
  private muted: boolean;
  private lastSweepTickAt = 0;

  constructor() {
    this.muted = readStoredMute();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeStoredMute(muted);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    if (!this.ctx) {
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    durationMs: number,
    type: OscillatorType,
    gainPeak: number,
    startDelayS = 0,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + startDelayS;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  }

  private noiseBurst(durationMs: number, gainPeak: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * (durationMs / 1000)));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(gainPeak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    source.connect(gain).connect(ctx.destination);
    source.start(now);
  }

  /** Soft blip as the cursor crosses a minor frequency division, rate-throttled. */
  sweepTick(frequency: number): void {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - this.lastSweepTickAt < SWEEP_TICK_MIN_INTERVAL_MS) return;
    this.lastSweepTickAt = now;
    const pitch = 320 + frequency * 560;
    this.tone(pitch, 45, "sine", 0.02);
  }

  /** Short detuned noise burst on a decoy hit. */
  decoyBump(): void {
    this.noiseBurst(90, 0.05);
    this.tone(220, 90, "square", 0.015);
  }

  /** The wow-moment chime: a rising sweep into a bell-like tone. */
  flareLock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const sweep = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweep.type = "sine";
    sweep.frequency.setValueAtTime(300, now);
    sweep.frequency.exponentialRampToValueAtTime(900, now + 0.09);
    sweepGain.gain.setValueAtTime(0.05, now);
    sweepGain.gain.linearRampToValueAtTime(0.0001, now + 0.1);
    sweep.connect(sweepGain).connect(ctx.destination);
    sweep.start(now);
    sweep.stop(now + 0.11);

    this.tone(880, 620, "sine", 0.06, 0.08);
    this.tone(1320, 640, "sine", 0.045, 0.09);
  }

  /** Three-note ascending arpeggio on puzzle win. */
  winJingle(): void {
    this.tone(523.25, 160, "triangle", 0.05, 0);
    this.tone(659.25, 160, "triangle", 0.05, 0.12);
    this.tone(783.99, 260, "triangle", 0.05, 0.24);
  }

  /** Low descending tone on out-of-sweeps. */
  loseTone(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.5);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  }
}
