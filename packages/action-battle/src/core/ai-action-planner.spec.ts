import { afterEach, describe, expect, test } from "vitest";
import { setActionBattleOptions } from "../config";
import { evaluateActionBattleAiSkill } from "./ai-action-planner";

const player = (id: string, x: number, y: number) => ({
  id,
  hp: 10,
  x: () => x,
  y: () => y,
  hitbox: () => ({ w: 0, h: 0 }),
});

const enemy = (map: any, hp = 10) => ({
  id: "enemy",
  hp,
  sp: 20,
  x: () => 0,
  y: () => 0,
  hitbox: () => ({ w: 0, h: 0 }),
  getCurrentMap: () => map,
  battleAi: {
    getFaction: () => "enemies",
    getTargets: () => "players",
  },
});

describe("Action Battle AI skill planner", () => {
  afterEach(() => {
    setActionBattleOptions({});
  });

  test("uses Studio targeting range for a projectile without requiring contact", () => {
    const target = player("hero", 150, 0);
    const map = {
      tileWidth: 32,
      tileHeight: 32,
      getPlayers: () => [target],
      getEvents: () => [],
    };
    const evaluation = evaluateActionBattleAiSkill({
      attacker: enemy(map) as any,
      target: target as any,
      skill: {
        id: "fireball",
        spCost: 4,
        targeting: { range: 6 },
        action: { mode: "projectile", target: "enemy", cooldownMs: 800 },
      },
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 1,
    });

    expect(evaluation).toMatchObject({
      id: "fireball",
      mode: "projectile",
      range: 192,
      preferredRange: 144,
    });
    expect(evaluation.rejection).toBeUndefined();
  });

  test("prefers explicit projectile range over Studio targeting range", () => {
    const target = player("hero", 100, 0);
    const map = { tileWidth: 32, tileHeight: 32 };
    const evaluation = evaluateActionBattleAiSkill({
      attacker: enemy(map) as any,
      target: target as any,
      skill: {
        id: "short-bolt",
        targeting: { range: 6 },
        action: {
          mode: "projectile",
          target: "enemy",
          projectile: { range: 80 },
        },
      },
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 1,
    });

    expect(evaluation.range).toBe(80);
    expect(evaluation.rejection).toBe("outOfRange");
  });

  test("plans vertical projectiles with the configured rectangular tile reach", () => {
    setActionBattleOptions({
      ui: {
        targeting: {
          tileSize: { width: 10, height: 24 },
        },
      },
    });
    const target = player("hero", 0, 50);
    const map = {
      tileWidth: 32,
      tileHeight: 32,
      getPlayers: () => [target],
      getEvents: () => [],
    };
    const evaluation = evaluateActionBattleAiSkill({
      attacker: enemy(map) as any,
      target: target as any,
      skill: {
        id: "vertical-bolt",
        targeting: { range: 3 },
        action: { mode: "projectile", target: "enemy" },
      },
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 1,
    });

    expect(evaluation).toMatchObject({
      id: "vertical-bolt",
      range: 72,
      preferredRange: 54,
    });
    expect(evaluation.rejection).toBeUndefined();
  });

  test("plans from the explicit projectile direction used for emission", () => {
    setActionBattleOptions({
      ui: {
        targeting: {
          tileSize: { width: 10, height: 24 },
        },
      },
    });
    const target = player("hero", 0, 20);
    const map = {
      tileWidth: 32,
      tileHeight: 32,
      getPlayers: () => [target],
      getEvents: () => [],
    };
    const evaluation = evaluateActionBattleAiSkill({
      attacker: enemy(map) as any,
      target: target as any,
      skill: {
        id: "sideways-bolt",
        targeting: { range: 3 },
        action: {
          mode: "projectile",
          target: "enemy",
          projectile: { direction: { x: 1, y: 0 } },
        },
      },
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 1,
    });

    expect(evaluation).toMatchObject({
      id: "sideways-bolt",
      range: 30,
      preferredRange: 22.5,
      rejection: "invalidTarget",
    });

    const alignedTarget = player("aligned-hero", 20, 0);
    const aligned = evaluateActionBattleAiSkill({
      attacker: enemy(map) as any,
      target: alignedTarget as any,
      skill: evaluation.skill,
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 1,
    });
    expect(aligned.range).toBe(30);
    expect(aligned.rejection).toBeUndefined();
  });

  test("places an instant area skill so a hollow mask covers the player", () => {
    const target = player("hero", 64, 0);
    const map = {
      tileWidth: 32,
      tileHeight: 32,
      getPlayers: () => [target],
      getEvents: () => [],
    };
    const evaluation = evaluateActionBattleAiSkill({
      attacker: enemy(map) as any,
      target: target as any,
      skill: {
        id: "cross",
        targeting: {
          range: 1,
          aoeMask: ["010", "101", "010"],
        },
        action: { mode: "instant", target: "enemy" },
      },
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 1,
    });

    expect(evaluation.targetTile).toEqual({ x: 1, y: 0 });
    expect(evaluation.target).toEqual([target]);
    expect(evaluation.rejection).toBeUndefined();
  });

  test("uses self healing only below the automatic health threshold", () => {
    const map = {};
    const attacker = enemy(map, 5);
    const target = player("hero", 20, 0);
    const skill = {
      id: "heal",
      skillType: "healing",
      action: { mode: "instant", target: "self" },
      onUse: () => {},
    };
    const lowHealth = evaluateActionBattleAiSkill({
      attacker: attacker as any,
      target: target as any,
      skill,
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 0.5,
    });
    const healthy = evaluateActionBattleAiSkill({
      attacker: attacker as any,
      target: target as any,
      skill,
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 0.8,
    });

    expect(lowHealth.target).toBe(attacker);
    expect(lowHealth.rejection).toBeUndefined();
    expect(healthy.rejection).toBe("notUseful");
  });

  test("rejects self healing without an authored healing effect", () => {
    const map = {};
    const attacker = enemy(map, 5);
    const target = player("hero", 20, 0);
    const evaluation = evaluateActionBattleAiSkill({
      attacker: attacker as any,
      target: target as any,
      skill: {
        id: "empty-heal",
        skillType: "healing",
        power: 20,
        action: { mode: "instant", target: "self" },
      },
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 0.25,
    });

    expect(evaluation.target).toBe(attacker);
    expect(evaluation.rejection).toBe("missingEffect");
  });
});
