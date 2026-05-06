import { describe, expect, test, vi } from "vitest";
import {
  ActionBattleHitTracker,
  createActionBattleAttackId,
  getNormalizedActionBattleAttackProfile,
  resolveActionBattleHitboxSpeed,
  scheduleActionBattleStartup,
} from "./attack-runtime";

describe("attack runtime helpers", () => {
  test("resolves a normalized profile from action battle options", () => {
    const profile = getNormalizedActionBattleAttackProfile({
      attack: {
        lockDurationMs: 420,
        profile: {
          startupMs: 100,
          activeMs: 80,
        },
      },
    });

    expect(profile).toMatchObject({
      startupMs: 100,
      activeMs: 80,
      recoveryMs: 240,
      totalDurationMs: 420,
    });
  });

  test("maps activeMs to moving hitbox speed", () => {
    const profile = getNormalizedActionBattleAttackProfile({
      attack: {
        profile: {
          activeMs: 96,
        },
      },
    });

    expect(resolveActionBattleHitboxSpeed(profile, 1)).toBe(6);
    expect(resolveActionBattleHitboxSpeed(profile, 3)).toBe(2);
  });

  test("runs startup immediately when there is no wind-up", () => {
    const callback = vi.fn();
    const scheduler = vi.fn();
    const profile = getNormalizedActionBattleAttackProfile({
      attack: {
        profile: {
          startupMs: 0,
        },
      },
    });

    const timer = scheduleActionBattleStartup(profile, callback, scheduler);

    expect(timer).toBeNull();
    expect(callback).toHaveBeenCalledOnce();
    expect(scheduler).not.toHaveBeenCalled();
  });

  test("schedules startup when wind-up is configured", () => {
    const callback = vi.fn();
    const scheduler = vi.fn(() => "timer-id");
    const profile = getNormalizedActionBattleAttackProfile({
      attack: {
        profile: {
          startupMs: 120,
        },
      },
    });

    const timer = scheduleActionBattleStartup(profile, callback, scheduler);

    expect(timer).toBe("timer-id");
    expect(callback).not.toHaveBeenCalled();
    expect(scheduler).toHaveBeenCalledWith(callback, 120);
  });

  test("creates stable unique attack ids", () => {
    const first = createActionBattleAttackId("player-1", "sword");
    const second = createActionBattleAttackId("player-1", "sword");

    expect(first).toContain("player-1:sword:");
    expect(second).toContain("player-1:sword:");
    expect(first).not.toBe(second);
  });

  test("tracks once-per-target hit policy", () => {
    const tracker = new ActionBattleHitTracker("oncePerTarget");
    const target = { id: "enemy-1" };

    expect(tracker.tryHit(target)).toBe(true);
    expect(tracker.tryHit(target)).toBe(false);
  });

  test("allows repeated hits when configured", () => {
    const tracker = new ActionBattleHitTracker("allowRepeatHits");
    const target = { id: "enemy-1" };

    expect(tracker.tryHit(target)).toBe(true);
    expect(tracker.tryHit(target)).toBe(true);
  });
});
