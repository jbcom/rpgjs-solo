import { describe, expect, test } from "vitest";
import { ATK, MAXHP, MAXSP, STR } from "@rpgjs/server";
import { AttackPattern, EnemyType } from "@rpgjs/action-battle/server";
import { getGraphicKey, getGraphicScale } from "../src/graphic-key";
import {
  applyTriggerSettings,
  initializeEnemyNaturalAttackFromStudioConfig,
  initializeEnemyVitalsFromParameters,
  resolveEnemyBattleAiOptions,
} from "../src/event-type-runtime";

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

  test("keeps Studio instance scale from params", () => {
    expect(
      getGraphicScale(
        { scale: 0.5 },
        { metadata: { scale: 2 } },
      ),
    ).toBe(0.5);
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
      targets: "players",
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

  test("normalizes a single Studio attack pattern string", () => {
    const options = resolveEnemyBattleAiOptions({
      behavior: {
        attackPatterns: "dashAttack",
      },
      animations: {},
    });

    expect(options.attackPatterns).toEqual([AttackPattern.DashAttack]);
  });

  test("initializes Studio enemy vitals from configured parameters", () => {
    const event: any = {
      hp: 0,
      sp: 0,
      param: {
        [MAXHP]: 32,
        [MAXSP]: 11,
      },
    };

    initializeEnemyVitalsFromParameters(event);

    expect(event.hp).toBe(32);
    expect(event.sp).toBe(11);
  });

  test("uses Studio strength as natural attack for enemies without weapon or skill", () => {
    const event: any = {
      param: {
        [STR]: 10,
      },
    };

    initializeEnemyNaturalAttackFromStudioConfig(event, {
      parameters: {
        [STR]: { start: 10, end: 635 },
      },
      startingEquipment: {
        weaponId: "",
      },
      skills: [],
    });

    expect(event.paramsModifier[ATK]).toEqual({ value: 10 });
    expect(event.param[ATK]).toBeUndefined();
  });

  test("does not synthesize natural attack when Studio already configured an attack source", () => {
    const event: any = {
      param: {
        [STR]: 10,
      },
    };

    initializeEnemyNaturalAttackFromStudioConfig(event, {
      parameters: {
        [ATK]: { start: 5, end: 50 },
        [STR]: { start: 10, end: 100 },
      },
    });

    initializeEnemyNaturalAttackFromStudioConfig(event, {
      parameters: {
        [STR]: { start: 10, end: 100 },
      },
      startingEquipment: {
        weaponId: "weapon-id",
      },
    });

    initializeEnemyNaturalAttackFromStudioConfig(event, {
      parameters: {
        [STR]: { start: 10, end: 100 },
      },
      skills: ["slash"],
    });

    expect(event.paramsModifier).toBeUndefined();
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

  test("applies Studio movement speed before starting approach movement", () => {
    const observed: Array<{ speed: number; frequency: number }> = [];
    const event: any = {
      speed: 4,
      frequency: 0,
      getCurrentMap: () => ({ getPlayers: () => [{ id: "player" }] }),
      moveTo: () => {
        observed.push({ speed: event.speed, frequency: event.frequency });
      },
      stopMoveTo: () => {},
      infiniteMoveRoute: () => {},
      setGraphicAnimation: () => {},
      changeDirection: () => {},
    };

    applyTriggerSettings({
      event,
      trigger: {
        movement: {
          type: "approach",
          speed: "slower",
          frequency: "normal",
        },
      },
      fallbackParams: {},
      eventType: "character",
      object: {},
    });

    expect(observed).toEqual([{ speed: 0.5, frequency: 100 }]);
  });

  test("starts Studio random movement with stuck recovery", () => {
    const calls: any[] = [];
    const event: any = {
      speed: 4,
      frequency: 0,
      stopMoveTo: () => calls.push(["stopMoveTo"]),
      infiniteMoveRoute: (...args: any[]) => calls.push(["infiniteMoveRoute", ...args]),
      setGraphicAnimation: (...args: any[]) => calls.push(["setGraphicAnimation", ...args]),
      changeDirection: () => {},
    };

    applyTriggerSettings({
      event,
      trigger: {
        movement: {
          type: "random",
          speed: "faster",
          frequency: "normal",
        },
        pattern: "initial",
      },
      fallbackParams: {},
      eventType: "character",
      object: {},
    });

    const randomCall = calls.find(([name]) => name === "infiniteMoveRoute");
    expect(randomCall).toBeTruthy();
    expect(randomCall[2]?.onStuck?.()).toBe(true);
    expect(randomCall[2]?.frequencyRatio).toBe(1);
    expect(calls).toContainEqual(["setGraphicAnimation", "walk"]);
    expect(calls).not.toContainEqual(["setGraphicAnimation", "stand", Infinity]);
    expect(event.speed).toBeGreaterThan(4);
    expect(event.frequency).toBe(100);
  });

  test("applies Studio event params scale separately from graphic id", () => {
    const calls: any[] = [];
    const scaleCalls: any[] = [];
    const event: any = {
      setGraphic: (graphic: any) => calls.push(graphic),
      _graphicScale: {
        set: (scale: any) => scaleCalls.push(scale),
      },
      changeDirection: () => {},
      stopMoveTo: () => {},
      setGraphicAnimation: () => {},
    };

    applyTriggerSettings({
      event,
      trigger: {
        graphic: "characters/hero.png",
      },
      fallbackParams: {
        scale: 0.5,
      },
      eventType: "character",
      object: {},
    });

    expect(scaleCalls).toContain(0.5);
    expect(calls).toContain("characters/hero.png");
  });

  test("locks animated Studio event patterns as continuous walk animations", () => {
    const calls: any[] = [];
    const event: any = {
      animationFixed: false,
      speed: 4,
      frequency: 0,
      setGraphicAnimation: (...args: any[]) => calls.push(args),
      changeDirection: () => {},
      stopMoveTo: () => {},
    };

    applyTriggerSettings({
      event,
      trigger: {
        pattern: "animate",
        movement: { type: "fixed" },
      },
      fallbackParams: {},
      eventType: "character",
      object: {},
    });

    expect(calls).toContainEqual(["walk", Infinity]);
    expect(event.animationFixed).toBe(true);
  });
});
