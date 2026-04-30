import { describe, expect, test, vi } from "vitest";
import { applyActionBattleHit } from "./hit";
import type { ActionBattleCombatSystem } from "./contracts";

const entity = (hp = 100) => ({
  hp,
  x: () => 0,
  y: () => 0,
  knockback: vi.fn(),
});

describe("applyActionBattleHit", () => {
  test("runs beforeHit before resolving damage", () => {
    const calls: string[] = [];
    const attacker = entity();
    const target = entity();
    const system: ActionBattleCombatSystem = {
      resolveHitboxes: () => [],
      resolveDamage: () => {
        calls.push("damage");
        return { damage: 12, defeated: false };
      },
      resolveKnockback: () => ({ force: 0, duration: 0 }),
      hooks: {
        beforeHit() {
          calls.push("before");
        },
        afterHit() {
          calls.push("after");
        },
      },
    };

    const result = applyActionBattleHit(system, { attacker: attacker as any, target: target as any });

    expect(result.damage).toBe(12);
    expect(calls).toEqual(["before", "damage", "after"]);
  });

  test("can cancel a hit before damage is resolved", () => {
    const resolveDamage = vi.fn();
    const attacker = entity();
    const target = entity();
    const system: ActionBattleCombatSystem = {
      resolveHitboxes: () => [],
      resolveDamage,
      resolveKnockback: () => ({ force: 0, duration: 0 }),
      hooks: {
        beforeHit: () => false,
      },
    };

    const result = applyActionBattleHit(system, { attacker: attacker as any, target: target as any });

    expect(result.cancelled).toBe(true);
    expect(resolveDamage).not.toHaveBeenCalled();
  });
});
