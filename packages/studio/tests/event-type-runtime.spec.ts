import { describe, expect, test } from "vitest";
import { AttackPattern, EnemyType } from "@rpgjs/action-battle/server";
import { getGraphicKey } from "../src/graphic-key";
import { resolveEnemyBattleAiOptions } from "../src/event-type-runtime";

describe("Studio event runtime", () => {
  test("uses the media id before fileName for Studio media graphics", () => {
    expect(
      getGraphicKey({
        _id: "8faef5ea-b787-4e2b-a623-1484141e2f07",
        fileName: "1777648912637-winkhiw5.png",
        metadata: {
          scale: 0.5,
        },
      }),
    ).toBe("8faef5ea-b787-4e2b-a623-1484141e2f07");
  });

  test("keeps fileName fallback for direct graphic assets", () => {
    expect(
      getGraphicKey({
        fileName: "characters/hero.png",
      }),
    ).toBe("characters/hero.png");
  });

  test("maps Studio enemy behavior payload to action battle AI options", () => {
    const options = resolveEnemyBattleAiOptions({
      name: "White Bear",
      behavior: {
        enemyType: "aggressive",
        attackCooldown: 1000,
        visionRange: 150,
        attackRange: 60,
        dodgeChance: 0.2,
        dodgeCooldown: 2000,
        fleeThreshold: 0.2,
        attackPatterns: ["melee", "combo", "dashAttack"],
        patrolWaypoints: [{ x: "10", y: 20 }],
        groupBehavior: false,
      },
      animations: {
        attack: "",
        hurt: "",
        die: "",
        castSpell: "",
      },
    });

    expect(options).toMatchObject({
      enemyType: EnemyType.Aggressive,
      attackCooldown: 1000,
      visionRange: 150,
      attackRange: 60,
      dodgeChance: 0.2,
      dodgeCooldown: 2000,
      fleeThreshold: 0.2,
      attackPatterns: [
        AttackPattern.Melee,
        AttackPattern.Combo,
        AttackPattern.DashAttack,
      ],
      patrolWaypoints: [{ x: 10, y: 20 }],
      groupBehavior: false,
    });
    expect(options.behavior).toBeUndefined();
  });

  test("still maps behavior gauge settings when present", () => {
    const options = resolveEnemyBattleAiOptions({
      behavior: {
        enemyType: "defensive",
        baseScore: 42,
        updateInterval: "300",
        assaultThreshold: 70,
      },
      animations: {},
    });

    expect(options.enemyType).toBe(EnemyType.Defensive);
    expect(options.behavior).toEqual({
      baseScore: 42,
      updateInterval: 300,
      assaultThreshold: 70,
    });
  });
});
