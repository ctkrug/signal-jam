import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SfxPlayer } from "../src/audio";

function fakeAudioParam() {
  return {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

class FakeOscillator {
  type = "sine";
  frequency = fakeAudioParam();
  connect = vi.fn().mockReturnThis();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain {
  gain = fakeAudioParam();
  connect = vi.fn().mockReturnThis();
}

class FakeBufferSource {
  buffer: unknown;
  connect = vi.fn().mockReturnThis();
  start = vi.fn();
}

class FakeAudioContext {
  static instanceCount = 0;
  state = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  createOscillator = vi.fn(() => new FakeOscillator());
  createGain = vi.fn(() => new FakeGain());
  createBufferSource = vi.fn(() => new FakeBufferSource());
  createBuffer = vi.fn((_channels: number, length: number) => ({
    getChannelData: () => new Float32Array(length),
  }));

  constructor() {
    FakeAudioContext.instanceCount += 1;
  }
}

describe("SfxPlayer", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to unmuted when no preference is stored", () => {
    expect(new SfxPlayer().isMuted).toBe(false);
  });

  it("restores a previously stored mute preference", () => {
    localStorage.setItem("signal-jam:muted", "1");
    expect(new SfxPlayer().isMuted).toBe(true);
  });

  it("persists mute state across instances", () => {
    const first = new SfxPlayer();
    first.setMuted(true);
    expect(new SfxPlayer().isMuted).toBe(true);
  });

  it("toggleMuted flips and returns the new state", () => {
    const player = new SfxPlayer();
    expect(player.toggleMuted()).toBe(true);
    expect(player.isMuted).toBe(true);
    expect(player.toggleMuted()).toBe(false);
  });

  it("degrades gracefully when localStorage.setItem throws (e.g. private mode)", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded");
    });
    const player = new SfxPlayer();
    expect(() => player.setMuted(true)).not.toThrow();
    spy.mockRestore();
  });

  it("every SFX call is a safe no-op without a WebAudio implementation", () => {
    // jsdom does not implement AudioContext, so this exercises the
    // "WebAudio unavailable" guard on every code path.
    const player = new SfxPlayer();
    expect(() => player.sweepTick(0.5)).not.toThrow();
    expect(() => player.decoyBump()).not.toThrow();
    expect(() => player.flareLock()).not.toThrow();
    expect(() => player.winJingle()).not.toThrow();
    expect(() => player.loseTone()).not.toThrow();
  });

  it("muting suppresses sound generation without throwing", () => {
    const player = new SfxPlayer();
    player.setMuted(true);
    expect(() => player.flareLock()).not.toThrow();
  });
});

describe("SfxPlayer with a WebAudio implementation available", () => {
  beforeEach(() => {
    localStorage.clear();
    FakeAudioContext.instanceCount = 0;
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lazily creates exactly one AudioContext across multiple calls", () => {
    const player = new SfxPlayer();
    expect(FakeAudioContext.instanceCount).toBe(0); // not yet created

    player.sweepTick(0.5);
    expect(FakeAudioContext.instanceCount).toBe(1);

    player.decoyBump();
    player.winJingle();
    // Constructing a new context per call (rather than reusing one)
    // would violate the documented "lazy, first-call" contract.
    expect(FakeAudioContext.instanceCount).toBe(1);
  });

  it("decoyBump wires an oscillator through gain to the destination and starts it", () => {
    const player = new SfxPlayer();
    player.decoyBump();
    const ctx = (player as unknown as { ctx: FakeAudioContext }).ctx;
    expect(ctx.createBufferSource).toHaveBeenCalled();
    expect(ctx.createOscillator).toHaveBeenCalled();
    const osc = ctx.createOscillator.mock.results[0]?.value as FakeOscillator;
    expect(osc.start).toHaveBeenCalled();
  });

  it("winJingle plays three ascending notes", () => {
    const player = new SfxPlayer();
    player.winJingle();
    const ctx = (player as unknown as { ctx: FakeAudioContext }).ctx;
    expect(ctx.createOscillator).toHaveBeenCalledTimes(3);
  });

  it("sweepTick is rate-throttled: a second call within the throttle window is silent", () => {
    const player = new SfxPlayer();
    const now = vi.spyOn(performance, "now");

    now.mockReturnValue(1000);
    player.sweepTick(0.5);
    const ctx = (player as unknown as { ctx: FakeAudioContext }).ctx;
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1010); // well under the 70ms throttle window
    player.sweepTick(0.6);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1200); // past the throttle window
    player.sweepTick(0.7);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it("a muted player never touches the AudioContext at all", () => {
    const player = new SfxPlayer();
    player.setMuted(true);
    player.sweepTick(0.5);
    player.decoyBump();
    player.flareLock();
    player.winJingle();
    player.loseTone();
    expect((player as unknown as { ctx: FakeAudioContext | null }).ctx).toBeNull();
  });

  it("resumes a suspended context on the next sound", () => {
    const player = new SfxPlayer();
    player.decoyBump(); // creates the context
    const ctx = (player as unknown as { ctx: FakeAudioContext }).ctx;
    ctx.state = "suspended";

    player.decoyBump();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it("flareLock wires the rising sweep oscillator plus two chime tones", () => {
    const player = new SfxPlayer();
    player.flareLock();
    const ctx = (player as unknown as { ctx: FakeAudioContext }).ctx;
    // The sweep oscillator plus tone()'s two bell tones = 3 oscillators.
    expect(ctx.createOscillator).toHaveBeenCalledTimes(3);
  });

  it("loseTone wires a single descending oscillator", () => {
    const player = new SfxPlayer();
    player.loseTone();
    const ctx = (player as unknown as { ctx: FakeAudioContext }).ctx;
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    const osc = ctx.createOscillator.mock.results[0]?.value as FakeOscillator;
    expect(osc.type).toBe("sawtooth");
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });

  it("degrades to silence instead of throwing when the AudioContext constructor itself throws", () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new DOMException("blocked by permissions policy");
        }
      },
    );
    const player = new SfxPlayer();
    expect(() => player.flareLock()).not.toThrow();
    expect((player as unknown as { ctx: unknown }).ctx).toBeNull();
  });
});

describe("SfxPlayer mute preference read failures", () => {
  it("defaults to unmuted instead of throwing when localStorage.getItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("SecurityError");
    });
    expect(() => new SfxPlayer()).not.toThrow();
    expect(new SfxPlayer().isMuted).toBe(false);
    spy.mockRestore();
  });
});
