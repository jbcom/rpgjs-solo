import { MAXHP } from "@rpgjs/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BattleAi } from "./ai.server";
import { chase, idle, ifTargetVisible } from "./core/ai-behavior-tree";
import { setActionBattleSystems } from "./core/context";

const createEvent = () => ({
  id: "monster-1",
  hp: 0,
  param: {
    [MAXHP]: 10,
  },
  attachShape: vi.fn(),
  flash: vi.fn(),
  showHit: vi.fn(),
  setGraphicAnimation: vi.fn(),
  stopMoveTo: vi.fn(),
  moveTo: vi.fn(),
  getCurrentMap: vi.fn(() => ({})),
  remove: vi.fn(),
  x: vi.fn(() => 0),
  y: vi.fn(() => 0),
  direction: vi.fn(() => "down"),
  changeDirection: vi.fn(),
});

const createPlayer = () => ({
  id: "player-1",
  exp: 0,
  gold: 0,
  addItem: vi.fn(() => ({ name: () => "Potion" })),
  showNotification: vi.fn(),
  getCurrentMap: vi.fn(() => ({
    database: () => ({
      potion: { icon: "potion-icon" },
    }),
  })),
});

describe("BattleAi defeat flow", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setActionBattleSystems({});
  });

  test("awards the attacker and requests a defeated remove transition", () => {
    const event = createEvent();
    const attacker = createPlayer();
    const ai = new BattleAi(event as any, {
      animations: {
        die: {
          animationName: "die",
          repeat: 1,
          delayMs: 700,
        },
      },
      rewards: {
        exp: 25,
        gold: 7,
        items: [{ itemId: "potion", amount: 2, chance: 100 }],
        showNotification: true,
      },
    });

    expect(ai.handleDamage(attacker as any, { damage: 10, defeated: true })).toBe(true);

    expect(attacker.exp).toBe(25);
    expect(attacker.gold).toBe(7);
    expect(attacker.addItem).toHaveBeenCalledWith("potion", 2);
    expect(event.setGraphicAnimation).not.toHaveBeenCalledWith("die", 1);
    expect(event.remove).toHaveBeenCalledWith({
      reason: "defeated",
      data: {
        animation: expect.objectContaining({
          animationName: "die",
          delayMs: 700,
        }),
      },
      transition: {
        animation: "die",
        graphic: undefined,
        duration: 700,
      },
      timeoutMs: 700,
    });
  });

  test("supports the context onDefeated callback and manual reward control", () => {
    const event = createEvent();
    const attacker = createPlayer();
    const onDefeated = vi.fn(({ reward }) => {
      expect(reward.awarded).toBe(false);
      reward.giveTo(attacker as any);
      expect(reward.awarded).toBe(true);
    });
    const ai = new BattleAi(event as any, {
      autoAwardRewards: false,
      rewards: {
        exp: 10,
      },
      onDefeated,
    });

    ai.handleDamage(attacker as any, { damage: 10, defeated: true });

    expect(onDefeated).toHaveBeenCalledWith(
      expect.objectContaining({
        event,
        attacker,
        reward: expect.any(Object),
        remove: expect.any(Function),
      })
    );
    expect(attacker.exp).toBe(10);
    expect(event.remove).toHaveBeenCalledWith({
      reason: "defeated",
      data: {
        animation: null,
      },
      transition: undefined,
      timeoutMs: 0,
    });
  });
});

describe("BattleAi vision setup", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setActionBattleSystems({});
  });

  test("retries vision attachment when the physics body is not ready yet", () => {
    vi.useFakeTimers();
    const event = createEvent();
    const visionShape = { id: "vision_monster-1" };
    event.attachShape.mockReturnValueOnce(undefined).mockReturnValueOnce(visionShape);

    const ai = new BattleAi(event as any);

    expect(event.attachShape).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60);

    expect(event.attachShape).toHaveBeenCalledTimes(2);
    expect(event.attachShape).toHaveBeenLastCalledWith("vision_monster-1", {
      radius: 150,
      width: 300,
      height: 300,
      angle: 360,
    });

    ai.destroy();
  });
});

describe("BattleAi behavior tree", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setActionBattleSystems({});
  });

  test("executes simplified behavior intents", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      simpleBehavior: {
        when: [ifTargetVisible(chase())],
      },
    });

    ai.onDetectInShape(player as any, {});
    vi.advanceTimersByTime(100);

    expect(event.moveTo).toHaveBeenCalledWith(player);
    ai.destroy();
  });

  test("composes named AI presets with local overrides", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    setActionBattleSystems({
      ai: {
        presets: {
          slime: {
            preset: "aggressive",
            visionRange: 220,
            simpleBehavior: {
              otherwise: chase(),
            },
          },
        },
      },
    });

    const ai = new BattleAi(event as any, {
      preset: "slime",
      attackRange: 70,
    });

    expect(event.attachShape).toHaveBeenCalledWith("vision_monster-1", {
      radius: 220,
      width: 440,
      height: 440,
      angle: 360,
    });
    ai.destroy();
  });

  test("local behavior tree overrides preset simple behavior", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    setActionBattleSystems({
      ai: {
        presets: {
          ranged: {
            simpleBehavior: {
              otherwise: chase(),
            },
          },
        },
      },
    });

    const ai = new BattleAi(event as any, {
      preset: "ranged",
      behaviorTree: () => ({ status: "success", intent: idle() }),
    });

    ai.onDetectInShape(player as any, {});
    vi.advanceTimersByTime(100);

    expect(event.moveTo).not.toHaveBeenCalled();
    expect(event.stopMoveTo).toHaveBeenCalled();
    ai.destroy();
  });

  test("does not target an already defeated player", () => {
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const ai = new BattleAi(event as any);
    const player = {
      ...createPlayer(),
      hp: 0,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };

    ai.onDetectInShape(player as any, {});

    expect(ai.getTarget()).toBeNull();
    ai.destroy();
  });

  test("behavior tree idle fallback does not block target acquisition", () => {
    vi.useFakeTimers();
    const event = createEvent();
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 30),
      y: vi.fn(() => 0),
    };
    const map = {
      getPlayers: vi.fn(() => [player]),
      getEvents: vi.fn(() => [event]),
    };
    event.getCurrentMap.mockReturnValue(map);
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });

    const ai = new BattleAi(event as any, {
      simpleBehavior: {
        otherwise: idle(),
      },
    });

    vi.advanceTimersByTime(100);

    expect(ai.getTarget()).toBe(player);
    ai.destroy();
  });

  test("clears its target when the player is defeated", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any);

    ai.onDetectInShape(player as any, {});
    expect(ai.getTarget()).toBe(player);

    player.hp = 0;
    vi.advanceTimersByTime(100);

    expect(ai.getTarget()).toBeNull();
    expect(event.stopMoveTo).toHaveBeenCalled();
    ai.destroy();
  });

  test("can target hostile BattleAi events by faction", () => {
    vi.useFakeTimers();
    const event = createEvent();
    const hostile = {
      ...createEvent(),
      id: "bandit-1",
      hp: 10,
      x: vi.fn(() => 30),
      y: vi.fn(() => 0),
      battleAi: {
        getFaction: () => "bandits",
        getTargets: () => "players",
      },
    };
    const map = {
      getPlayers: vi.fn(() => []),
      getEvents: vi.fn(() => [event, hostile]),
    };
    event.getCurrentMap.mockReturnValue(map);
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });

    const ai = new BattleAi(event as any, {
      faction: "guards",
      targets: ["bandits"],
    });

    vi.advanceTimersByTime(100);

    expect(ai.getTarget()).toBe(hostile);
    ai.destroy();
  });
});
