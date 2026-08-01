import { afterEach, describe, expect, it, vi } from "vitest";
import { RpgMusicManager } from "./MusicManager";

const createSound = () => ({
  play: vi.fn(),
  stop: vi.fn(),
  loop: vi.fn(),
  fade: vi.fn(),
  volume: vi.fn(() => 0.8),
});

describe("RpgMusicManager", () => {
  afterEach(() => vi.useRealTimers());

  it("crossfades map music into one stable override", async () => {
    vi.useFakeTimers();
    const sound = createSound();
    const manager = new RpgMusicManager({
      getSound: vi.fn(() => sound),
      createSound: vi.fn(),
    });

    await manager.enter("battle", { fadeInMs: 100, volume: 0.7 });
    await manager.enter("battle", { fadeInMs: 100, volume: 0.7 });
    vi.advanceTimersByTime(120);

    expect(sound.play).toHaveBeenCalledTimes(1);
    expect(sound.fade).toHaveBeenCalledWith(0, 0.7, 100);
    expect(manager.mapVolume()).toBe(0);
  });

  it("cancels a pending exit when combat resumes", async () => {
    vi.useFakeTimers();
    const sound = createSound();
    const manager = new RpgMusicManager({
      getSound: vi.fn(() => sound),
      createSound: vi.fn(),
    });

    await manager.enter("battle", { fadeInMs: 0 });
    manager.leave({ exitDelayMs: 100, fadeOutMs: 50 });
    await manager.enter("battle", { fadeInMs: 0 });
    vi.advanceTimersByTime(200);

    expect(sound.stop).not.toHaveBeenCalled();
    expect(manager.overrideId).toBe("battle");
  });

  it("restores map music after the configured exit delay", async () => {
    vi.useFakeTimers();
    const sound = createSound();
    const manager = new RpgMusicManager({
      getSound: vi.fn(() => sound),
      createSound: vi.fn(),
    });

    await manager.enter("battle", { fadeInMs: 0 });
    manager.leave({ exitDelayMs: 100, fadeOutMs: 50 });
    vi.advanceTimersByTime(170);

    expect(sound.stop).toHaveBeenCalledOnce();
    expect(manager.mapVolume()).toBe(1);
  });

  it("resolves audio paths with arbitrary query strings in linear time", async () => {
    const sound = createSound();
    const createSoundHost = vi.fn(() => sound);
    const getSound = vi.fn();
    const manager = new RpgMusicManager({
      getSound,
      createSound: createSoundHost,
    });
    const source = `battle.m4a?${"aac?".repeat(10_000)}`;

    await manager.enter(source, { fadeInMs: 0 });

    expect(getSound).not.toHaveBeenCalled();
    expect(createSoundHost).toHaveBeenCalledWith(source, {
      loop: true,
      volume: 0,
    });
  });

  it("does not mistake an unknown dotted identifier for an audio source", async () => {
    const sound = createSound();
    const createSoundHost = vi.fn();
    const getSound = vi.fn(() => sound);
    const manager = new RpgMusicManager({
      getSound,
      createSound: createSoundHost,
    });

    await manager.enter("encounter.boss", { fadeInMs: 0 });

    expect(getSound).toHaveBeenCalledWith("encounter.boss");
    expect(createSoundHost).not.toHaveBeenCalled();
  });
});
