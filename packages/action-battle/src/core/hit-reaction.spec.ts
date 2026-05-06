import { afterEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_ACTION_BATTLE_HIT_REACTION,
  isActionBattleEntityInvincible,
  normalizeActionBattleHitReaction,
  setActionBattleInvincibility,
} from "./hit-reaction";

describe("hit reaction helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("normalizes hit reaction defaults", () => {
    expect(normalizeActionBattleHitReaction(undefined)).toEqual(
      DEFAULT_ACTION_BATTLE_HIT_REACTION
    );
  });

  test("normalizes unsafe reaction values", () => {
    expect(
      normalizeActionBattleHitReaction({
        invincibilityMs: -10,
        hitstunMs: -20,
        staggerPower: -1,
      })
    ).toEqual({
      invincibilityMs: 0,
      hitstunMs: 0,
      staggerPower: 0,
    });
  });

  test("tracks invincibility windows on entities", () => {
    const entity = {};
    vi.spyOn(Date, "now").mockReturnValue(1000);

    setActionBattleInvincibility(entity, 250);

    expect(isActionBattleEntityInvincible(entity, 1100)).toBe(true);
    expect(isActionBattleEntityInvincible(entity, 1300)).toBe(false);
  });
});
