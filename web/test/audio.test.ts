import { beforeEach, describe, expect, it, vi } from "vitest";
import { SfxPlayer } from "../src/audio";

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
