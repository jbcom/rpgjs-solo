import { MAXHP } from "@rpgjs/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BattleAi } from "./ai.server";

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
  getCurrentMap: vi.fn(() => ({})),
  remove: vi.fn(),
  x: vi.fn(() => 0),
  y: vi.fn(() => 0),
  direction: vi.fn(() => "down"),
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
