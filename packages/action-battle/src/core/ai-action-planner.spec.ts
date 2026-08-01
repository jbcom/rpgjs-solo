import { afterEach, describe, expect, test, vi } from "vitest";
import { PhysicsEngine } from "@rpgjs/common";
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

  test("treats trajectory range and authored origin as emission-authoritative", () => {
    setActionBattleOptions({
      ui: { targeting: { tileSize: { width: 10, height: 24 } } },
    });
    const target = player("hero", 20, 20);
    const map = { tileWidth: 10, tileHeight: 24 };
    const skill = {
      id: "authored-bolt",
      targeting: { range: 3 },
      action: {
        mode: "projectile" as const,
        target: "enemy" as const,
        projectile: {
          origin: { x: 0, y: 20 },
          direction: { x: 1, y: 0 },
          range: 30,
          trajectory: { type: "linear", speed: 100, range: 5 },
        },
      },
    };
    const tooShort = evaluateActionBattleAiSkill({
      attacker: enemy(map) as any,
      target: target as any,
      skill,
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 1,
    });

    expect(tooShort.range).toBe(5);
    expect(tooShort.rejection).toBe("outOfRange");

    skill.action.projectile.trajectory.range = 25;
    const admitted = evaluateActionBattleAiSkill({
      attacker: enemy(map) as any,
      target: target as any,
      skill,
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 1,
    });
    expect(admitted.range).toBe(25);
    expect(admitted.rejection).toBeUndefined();
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

  test("bounds real physics work while classifying out-of-range versus invalid projectile targets", () => {
    const physics = new PhysicsEngine({ spatialCellSize: 8 });
    const world = physics.getWorld() as any;
    const queryAABB = vi.spyOn(world.spatialPartition, "queryAABB");
    const attacker = {
      ...enemy(null),
      x: () => 0,
      y: () => 0,
      hitbox: () => ({ w: 8, h: 8 }),
    };
    const map = {
      tileWidth: 10,
      tileHeight: 24,
      physic: physics,
    };
    attacker.getCurrentMap = () => map;
    const skill = {
      id: "bounded-bolt",
      action: {
        mode: "projectile" as const,
        target: "enemy" as const,
        projectile: {
          direction: { x: 1, y: 0 },
          trajectory: { type: "linear", range: 20 },
          collision: { radius: 2 },
        },
      },
    };
    const evaluate = (target: any) => evaluateActionBattleAiSkill({
      attacker: attacker as any,
      target,
      skill,
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 1,
    });

    const aligned = {
      ...player("aligned", 100, 0),
      hitbox: () => ({ w: 8, h: 8 }),
    };
    physics.createEntity({
      uuid: aligned.id,
      position: { x: 104, y: 4 },
      width: 8,
      height: 8,
    });
    expect(evaluate(aligned).rejection).toBe("outOfRange");

    const offAxis = {
      ...player("off-axis", 0, 100),
      hitbox: () => ({ w: 8, h: 8 }),
    };
    physics.createEntity({
      uuid: offAxis.id,
      position: { x: 4, y: 104 },
      width: 8,
      height: 8,
    });
    expect(evaluate(offAxis).rejection).toBe("invalidTarget");

    expect(queryAABB).toHaveBeenCalledTimes(2);
    for (const [bounds] of queryAABB.mock.calls) {
      expect(bounds.maxX - bounds.minX).toBeLessThanOrEqual(24);
      expect(bounds.maxY - bounds.minY).toBeLessThanOrEqual(4);
    }
  });

  test("rejects a projectile target behind a nearer world blocker but passes through allies", () => {
    const physics = new PhysicsEngine({ spatialCellSize: 8 });
    const target = {
      ...player("hero", 40, 0),
      hitbox: () => ({ w: 8, h: 8 }),
    };
    const ally = {
      ...enemy(null),
      id: "enemy-ally",
      x: () => 20,
      hitbox: () => ({ w: 8, h: 8 }),
    };
    const objects = new Map<string, any>([
      [target.id, target],
      [ally.id, ally],
    ]);
    const map = {
      tileWidth: 10,
      tileHeight: 10,
      physic: physics,
      getObjectById: (id: string) => objects.get(id),
      getPlayers: () => [target],
      getEvents: () => [ally],
    };
    const attacker = {
      ...enemy(map),
      x: () => 0,
      y: () => 0,
      hitbox: () => ({ w: 8, h: 8 }),
    };
    objects.set(attacker.id, attacker);
    for (const entry of [attacker, ally, target]) {
      physics.createEntity({
        uuid: entry.id,
        position: { x: entry.x() + 4, y: entry.y() + 4 },
        width: 8,
        height: 8,
      });
    }
    const skill = {
      id: "occluded-bolt",
      action: {
        mode: "projectile" as const,
        target: "enemy" as const,
        projectile: {
          direction: { x: 1, y: 0 },
          range: 80,
        },
      },
    };
    const evaluate = () => evaluateActionBattleAiSkill({
      attacker: attacker as any,
      target: target as any,
      skill,
      now: 1000,
      readyAt: 0,
      attackRange: 50,
      hpPercent: 1,
    });

    expect(evaluate().rejection).toBeUndefined();

    physics.createStaticObstacle("stone-wall", {
      x: 28,
      y: 4,
      width: 8,
      height: 8,
    });
    expect(evaluate().rejection).toBe("invalidTarget");
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
