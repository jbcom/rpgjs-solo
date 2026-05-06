import { describe, expect, test } from "vitest";
import {
  DEFAULT_ACTION_BATTLE_ENEMY_ATTACK_PROFILES,
  normalizeActionBattleEnemyAttackProfiles,
} from "./enemy-attack-profiles";

describe("enemy attack profiles", () => {
  test("normalizes every built-in enemy attack pattern", () => {
    const profiles = normalizeActionBattleEnemyAttackProfiles();

    expect(Object.keys(profiles).sort()).toEqual(
      Object.keys(DEFAULT_ACTION_BATTLE_ENEMY_ATTACK_PROFILES).sort()
    );
    expect(profiles.charged.startupMs).toBe(800);
    expect(profiles.zone.reaction.staggerPower).toBe(1.25);
  });

  test("overrides individual pattern timing", () => {
    const profiles = normalizeActionBattleEnemyAttackProfiles({
      melee: {
        startupMs: 60,
        activeMs: 40,
        recoveryMs: 100,
      },
    });

    expect(profiles.melee).toMatchObject({
      startupMs: 60,
      activeMs: 40,
      recoveryMs: 100,
      totalDurationMs: 200,
    });
    expect(profiles.charged.startupMs).toBe(800);
  });
});
