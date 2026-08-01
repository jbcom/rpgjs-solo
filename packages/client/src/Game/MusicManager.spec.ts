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

  it("only lets the current transition owner release the override", async () => {
    vi.useFakeTimers();
    const battle = createSound();
    const cutscene = createSound();
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) =>
        id === "battle" ? battle : cutscene
      ),
      createSound: vi.fn(),
    });
    const battleOwner = {};
    const cutsceneOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, battleOwner);
    await manager.enter("cutscene", { fadeInMs: 0 }, cutsceneOwner);
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, battleOwner);
    vi.runAllTimers();

    expect(manager.overrideId).toBe("cutscene");
    expect(cutscene.stop).not.toHaveBeenCalled();
    expect(manager.mapVolume()).toBe(0);

    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, cutsceneOwner);
    vi.runAllTimers();

    expect(manager.overrideId).toBeUndefined();
    expect(cutscene.stop).toHaveBeenCalledOnce();
    expect(manager.mapVolume()).toBe(1);
  });

  it("lets an owner cancel its pending music resolution", async () => {
    vi.useFakeTimers();
    const sound = createSound();
    let resolveSound: ((sound: ReturnType<typeof createSound>) => void) | undefined;
    const pendingSound = new Promise<ReturnType<typeof createSound>>((resolve) => {
      resolveSound = resolve;
    });
    const manager = new RpgMusicManager({
      getSound: vi.fn(() => pendingSound),
      createSound: vi.fn(),
    });
    const owner = {};

    const entering = manager.enter("battle", { fadeInMs: 0 }, owner);
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, owner);
    vi.runAllTimers();
    resolveSound?.(sound);
    await entering;

    expect(sound.play).not.toHaveBeenCalled();
    expect(manager.overrideId).toBeUndefined();
    expect(manager.mapVolume()).toBe(1);
  });

  it("restores the map mix when an idle override cannot resolve", async () => {
    vi.useFakeTimers();
    const manager = new RpgMusicManager({
      getSound: vi.fn(() => undefined),
      createSound: vi.fn(),
    });
    const owner = {};

    await manager.enter("missing", { fadeInMs: 0, fadeOutMs: 0 }, owner);
    vi.runAllTimers();
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, owner);
    vi.runAllTimers();

    expect(manager.overrideId).toBeUndefined();
    expect(manager.mapVolume()).toBe(1);
  });

  it("retains the current owner when a takeover cannot resolve", async () => {
    vi.useFakeTimers();
    const battle = createSound();
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) => id === "battle" ? battle : undefined),
      createSound: vi.fn(),
    });
    const battleOwner = {};
    const missingOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, battleOwner);
    await manager.enter(
      "missing",
      { fadeInMs: 0, fadeOutMs: 0 },
      missingOwner,
    );
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, missingOwner);
    vi.runAllTimers();

    expect(manager.overrideId).toBe("battle");
    expect(battle.stop).not.toHaveBeenCalled();

    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, battleOwner);
    vi.runAllTimers();

    expect(manager.overrideId).toBeUndefined();
    expect(battle.stop).toHaveBeenCalledOnce();
    expect(manager.mapVolume()).toBe(1);
  });

  it("finishes releasing the current owner when a pending takeover fails", async () => {
    vi.useFakeTimers();
    const battle = createSound();
    let resolveTakeover: ((sound: undefined) => void) | undefined;
    const pendingTakeover = new Promise<undefined>((resolve) => {
      resolveTakeover = resolve;
    });
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) =>
        id === "battle" ? battle : pendingTakeover
      ),
      createSound: vi.fn(),
    });
    const battleOwner = {};
    const cutsceneOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, battleOwner);
    const takingOver = manager.enter(
      "missing-cutscene",
      { fadeInMs: 0, fadeOutMs: 0 },
      cutsceneOwner,
    );
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, battleOwner);
    resolveTakeover?.(undefined);
    await takingOver;
    vi.runAllTimers();

    expect(battle.stop).toHaveBeenCalledOnce();
    expect(manager.overrideId).toBeUndefined();
    expect(manager.mapVolume()).toBe(1);
  });

  it("does not release a takeover that resolves after the previous owner exits", async () => {
    vi.useFakeTimers();
    const battle = createSound();
    let resolveTakeover: ((sound: ReturnType<typeof createSound>) => void) | undefined;
    const pendingTakeover = new Promise<ReturnType<typeof createSound>>((resolve) => {
      resolveTakeover = resolve;
    });
    const cutscene = createSound();
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) =>
        id === "battle" ? battle : pendingTakeover
      ),
      createSound: vi.fn(),
    });
    const battleOwner = {};
    const cutsceneOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, battleOwner);
    const takingOver = manager.enter(
      "cutscene",
      { fadeInMs: 0, fadeOutMs: 0 },
      cutsceneOwner,
    );
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, battleOwner);
    resolveTakeover?.(cutscene);
    await takingOver;
    vi.runAllTimers();

    expect(battle.stop).toHaveBeenCalled();
    expect(cutscene.stop).not.toHaveBeenCalled();
    expect(manager.overrideId).toBe("cutscene");
    expect(manager.mapVolume()).toBe(0);
  });

  it("cancels a release debt when a new owner reacquires the same sound", async () => {
    vi.useFakeTimers();
    const sharedSound = createSound();
    let resolveTakeover: ((sound: ReturnType<typeof createSound>) => void) | undefined;
    const pendingTakeover = new Promise<ReturnType<typeof createSound>>((resolve) => {
      resolveTakeover = resolve;
    });
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) =>
        id === "battle" ? sharedSound : pendingTakeover
      ),
      createSound: vi.fn(),
    });
    const battleOwner = {};
    const cutsceneOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, battleOwner);
    const takingOver = manager.enter(
      "dramatic-battle",
      { fadeInMs: 0, fadeOutMs: 0 },
      cutsceneOwner,
    );
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, battleOwner);
    resolveTakeover?.(sharedSound);
    await takingOver;
    vi.runAllTimers();

    expect(sharedSound.play).toHaveBeenCalledOnce();
    expect(sharedSound.stop).not.toHaveBeenCalled();
    expect(manager.overrideId).toBe("dramatic-battle");
    expect(manager.mapVolume()).toBe(0);
  });

  it("cancels a release debt on the same-id reacquisition fast path", async () => {
    vi.useFakeTimers();
    const sharedSound = createSound();
    let resolveTakeover: ((sound: ReturnType<typeof createSound>) => void) | undefined;
    const pendingTakeover = new Promise<ReturnType<typeof createSound>>((resolve) => {
      resolveTakeover = resolve;
    });
    const staleCutscene = createSound();
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) =>
        id === "battle" ? sharedSound : pendingTakeover
      ),
      createSound: vi.fn(),
    });
    const firstOwner = {};
    const pendingOwner = {};
    const nextOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, firstOwner);
    const staleEntering = manager.enter(
      "cutscene",
      { fadeInMs: 0 },
      pendingOwner,
    );
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, firstOwner);
    await manager.enter("battle", { fadeInMs: 0 }, nextOwner);
    resolveTakeover?.(staleCutscene);
    await staleEntering;
    vi.runAllTimers();

    expect(sharedSound.stop).not.toHaveBeenCalled();
    expect(staleCutscene.play).not.toHaveBeenCalled();
    expect(manager.overrideId).toBe("battle");
    expect(manager.mapVolume()).toBe(0);
  });

  it("reclaims a live noncurrent debt without duplicating playback", async () => {
    vi.useFakeTimers();
    const first = createSound();
    const second = createSound();
    const sounds = new Map([
      ["first", first],
      ["second", second],
    ]);
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) => sounds.get(id)),
      createSound: vi.fn(),
    });

    await manager.enter("first", { fadeInMs: 0 }, {});
    await manager.enter("second", { fadeInMs: 0, fadeOutMs: 1000 }, {});
    await manager.enter("first", { fadeInMs: 0, fadeOutMs: 0 }, {});
    vi.runAllTimers();

    expect(first.play).toHaveBeenCalledOnce();
    expect(first.stop).not.toHaveBeenCalled();
    expect(second.stop).toHaveBeenCalledOnce();
    expect(manager.overrideId).toBe("first");
  });

  it("replays an aliased sound that stopped before resolution", async () => {
    vi.useFakeTimers();
    const sharedSound = createSound();
    let resolveAlias: ((sound: ReturnType<typeof createSound>) => void) | undefined;
    const pendingAlias = new Promise<ReturnType<typeof createSound>>((resolve) => {
      resolveAlias = resolve;
    });
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) =>
        id === "battle" ? sharedSound : pendingAlias
      ),
      createSound: vi.fn(),
    });
    const firstOwner = {};
    const nextOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, firstOwner);
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, firstOwner);
    const aliasEntering = manager.enter(
      "battle-alias",
      { fadeInMs: 0, fadeOutMs: 0 },
      nextOwner,
    );
    vi.runAllTimers();
    resolveAlias?.(sharedSound);
    await aliasEntering;

    expect(sharedSound.stop).toHaveBeenCalledOnce();
    expect(sharedSound.play).toHaveBeenCalledTimes(2);
    expect(manager.overrideId).toBe("battle-alias");
    expect(manager.mapVolume()).toBe(0);
  });

  it("reset stops both current music and noncurrent release debts", async () => {
    vi.useFakeTimers();
    const battle = createSound();
    const cutscene = createSound();
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) =>
        id === "battle" ? battle : cutscene
      ),
      createSound: vi.fn(),
    });
    const battleOwner = {};
    const cutsceneOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, battleOwner);
    const takingOver = manager.enter(
      "cutscene",
      { fadeInMs: 0, fadeOutMs: 1000 },
      cutsceneOwner,
    );
    manager.leave({ exitDelayMs: 1000, fadeOutMs: 1000 }, battleOwner);
    await takingOver;
    manager.reset();
    vi.runAllTimers();

    expect(battle.stop).toHaveBeenCalledOnce();
    expect(cutscene.stop).toHaveBeenCalledOnce();
    expect(manager.overrideId).toBeUndefined();
    expect(manager.mapVolume()).toBe(1);
  });

  it("stops every detached sound across rapid resolved transitions", async () => {
    vi.useFakeTimers();
    const first = createSound();
    const second = createSound();
    const third = createSound();
    const sounds = new Map([
      ["first", first],
      ["second", second],
      ["third", third],
    ]);
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) => sounds.get(id)),
      createSound: vi.fn(),
    });

    await manager.enter("first", { fadeInMs: 0, fadeOutMs: 100 }, {});
    await manager.enter("second", { fadeInMs: 0, fadeOutMs: 100 }, {});
    await manager.enter("third", { fadeInMs: 0, fadeOutMs: 100 }, {});
    vi.advanceTimersByTime(120);

    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.stop).toHaveBeenCalledOnce();
    expect(third.stop).not.toHaveBeenCalled();
    expect(manager.overrideId).toBe("third");
  });

  it("finishes the previous release when the pending owner cancels", async () => {
    vi.useFakeTimers();
    const battle = createSound();
    let resolveTakeover: ((sound: ReturnType<typeof createSound>) => void) | undefined;
    const pendingTakeover = new Promise<ReturnType<typeof createSound>>((resolve) => {
      resolveTakeover = resolve;
    });
    const cutscene = createSound();
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) =>
        id === "battle" ? battle : pendingTakeover
      ),
      createSound: vi.fn(),
    });
    const battleOwner = {};
    const cutsceneOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, battleOwner);
    const takingOver = manager.enter(
      "cutscene",
      { fadeInMs: 0 },
      cutsceneOwner,
    );
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, battleOwner);
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, cutsceneOwner);
    resolveTakeover?.(cutscene);
    await takingOver;
    vi.runAllTimers();

    expect(battle.stop).toHaveBeenCalledOnce();
    expect(cutscene.play).not.toHaveBeenCalled();
    expect(manager.overrideId).toBeUndefined();
    expect(manager.mapVolume()).toBe(1);
  });

  it("preserves a release debt across a superseding failed transition", async () => {
    vi.useFakeTimers();
    const battle = createSound();
    let resolveFirstTakeover:
      | ((sound: ReturnType<typeof createSound>) => void)
      | undefined;
    const firstTakeover = new Promise<ReturnType<typeof createSound>>((resolve) => {
      resolveFirstTakeover = resolve;
    });
    const staleCutscene = createSound();
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) => {
        if (id === "battle") return battle;
        if (id === "first-cutscene") return firstTakeover;
        return undefined;
      }),
      createSound: vi.fn(),
    });
    const battleOwner = {};
    const firstOwner = {};
    const secondOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, battleOwner);
    const firstEntering = manager.enter(
      "first-cutscene",
      { fadeInMs: 0 },
      firstOwner,
    );
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, battleOwner);
    await manager.enter(
      "missing-second-cutscene",
      { fadeInMs: 0, fadeOutMs: 0 },
      secondOwner,
    );
    resolveFirstTakeover?.(staleCutscene);
    await firstEntering;
    vi.runAllTimers();

    expect(battle.stop).toHaveBeenCalledOnce();
    expect(staleCutscene.play).not.toHaveBeenCalled();
    expect(manager.overrideId).toBeUndefined();
    expect(manager.mapVolume()).toBe(1);
  });

  it("restores idle map music before propagating resolver rejection", async () => {
    vi.useFakeTimers();
    const failure = new Error("resolver offline");
    const manager = new RpgMusicManager({
      getSound: vi.fn(() => Promise.reject(failure)),
      createSound: vi.fn(),
    });

    await expect(
      manager.enter("missing", { fadeInMs: 0, fadeOutMs: 0 }, {}),
    ).rejects.toBe(failure);
    vi.runAllTimers();

    expect(manager.overrideId).toBeUndefined();
    expect(manager.mapVolume()).toBe(1);
  });

  it("finishes the previous release when a takeover resolver rejects", async () => {
    vi.useFakeTimers();
    const battle = createSound();
    const failure = new Error("cutscene unavailable");
    let rejectTakeover: ((error: Error) => void) | undefined;
    const pendingTakeover = new Promise<never>((_resolve, reject) => {
      rejectTakeover = reject;
    });
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) =>
        id === "battle" ? battle : pendingTakeover
      ),
      createSound: vi.fn(),
    });
    const battleOwner = {};
    const cutsceneOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, battleOwner);
    const takingOver = manager.enter(
      "cutscene",
      { fadeInMs: 0, fadeOutMs: 0 },
      cutsceneOwner,
    );
    manager.leave({ exitDelayMs: 0, fadeOutMs: 0 }, battleOwner);
    rejectTakeover?.(failure);
    await expect(takingOver).rejects.toBe(failure);
    vi.runAllTimers();

    expect(battle.stop).toHaveBeenCalledOnce();
    expect(manager.overrideId).toBeUndefined();
    expect(manager.mapVolume()).toBe(1);
  });

  it("preserves an owner release when a later takeover cannot resolve", async () => {
    vi.useFakeTimers();
    const battle = createSound();
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) => id === "battle" ? battle : undefined),
      createSound: vi.fn(),
    });
    const battleOwner = {};
    const cutsceneOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, battleOwner);
    manager.leave({ exitDelayMs: 100, fadeOutMs: 50 }, battleOwner);
    await manager.enter(
      "missing-cutscene",
      { fadeInMs: 0, fadeOutMs: 0 },
      cutsceneOwner,
    );
    vi.advanceTimersByTime(170);

    expect(battle.stop).toHaveBeenCalledOnce();
    expect(manager.overrideId).toBeUndefined();
    expect(manager.mapVolume()).toBe(1);
  });

  it("preserves an owner release when a later takeover rejects", async () => {
    vi.useFakeTimers();
    const battle = createSound();
    const failure = new Error("cutscene resolver failed");
    const manager = new RpgMusicManager({
      getSound: vi.fn((id: string) =>
        id === "battle" ? battle : Promise.reject(failure)
      ),
      createSound: vi.fn(),
    });
    const battleOwner = {};
    const cutsceneOwner = {};

    await manager.enter("battle", { fadeInMs: 0 }, battleOwner);
    manager.leave({ exitDelayMs: 100, fadeOutMs: 50 }, battleOwner);
    await expect(
      manager.enter(
        "missing-cutscene",
        { fadeInMs: 0, fadeOutMs: 0 },
        cutsceneOwner,
      ),
    ).rejects.toBe(failure);
    vi.advanceTimersByTime(170);

    expect(battle.stop).toHaveBeenCalledOnce();
    expect(manager.overrideId).toBeUndefined();
    expect(manager.mapVolume()).toBe(1);
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
