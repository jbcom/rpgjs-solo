import { afterEach, describe, expect, test, vi } from "vitest";
import {
  canActionBattleProjectileCollide,
  executeActionBattleUse,
  handleActionBattleProjectileDestroy,
  handleActionBattleProjectileImpact,
} from "./action-use";
import { setActionBattleSystems } from "./context";
import {
  beginActionBattleGuard,
  clearActionBattleDefense,
} from "./defense";
import { setActionBattleOptions } from "../config";

const createEntity = (id: string, hp = 100) => ({
  id,
  hp,
  sp: 100,
  param: { maxhp: hp },
  x: () => 0,
  y: () => 0,
  knockback: vi.fn(),
  applyStates: vi.fn(),
  applyDamage: vi.fn(),
  setGraphicAnimation: vi.fn(),
  flash: vi.fn(),
  showHit: vi.fn(),
});

describe("executeActionBattleUse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setActionBattleSystems({});
    setActionBattleOptions({});
  });

  test("preserves native skill and item restrictions before executing effects", () => {
    const restrictions = new Set(["CAN_NOT_SKILL", "CAN_NOT_ITEM"]);
    const attacker = {
      ...createEntity("caster"),
      hasEffect: vi.fn((effect: string) => restrictions.has(effect)),
    };
    const skillHook = vi.fn();
    const skill = {
      id: "sealed-art",
      _type: "skill",
      spCost: 10,
      hitRate: 1,
      onUse: skillHook,
    };
    const itemHook = vi.fn();
    const item = {
      id: "sealed-tonic",
      _type: "item",
      onUse: itemHook,
    };

    expect(
      executeActionBattleUse({
        attacker: attacker as any,
        usable: skill,
        skill,
      }),
    ).toBe(false);
    expect(attacker.sp).toBe(100);
    expect(skillHook).not.toHaveBeenCalled();

    expect(
      executeActionBattleUse({
        attacker: attacker as any,
        usable: item,
      }),
    ).toBe(false);
    expect(itemHook).not.toHaveBeenCalled();

    restrictions.clear();
    expect(
      executeActionBattleUse({
        attacker: attacker as any,
        usable: skill,
        skill,
      }),
    ).toBe(true);
    expect(attacker.sp).toBe(90);
    expect(skillHook).toHaveBeenCalledOnce();

    expect(
      executeActionBattleUse({
        attacker: attacker as any,
        usable: item,
      }),
    ).toBe(true);
    expect(itemHook).toHaveBeenCalledOnce();
  });

  test("rejects defeated attackers before every use side effect and allows revival", () => {
    const onUse = vi.fn();
    const emit = vi.fn(() => [{ id: "revival-bolt" }]);
    const attacker = {
      ...createEntity("caster", 0),
      sp: 20,
      getCurrentMap: () => ({ projectiles: { emit } }),
    };
    const skill = {
      id: "revival-bolt",
      _type: "skill",
      spCost: 5,
      hitRate: 1,
      action: { mode: "projectile" as const },
      onUse,
    };
    const projectileSkill = {
      ...skill,
      id: "revival-projectile",
      onUse: undefined,
    };

    expect(executeActionBattleUse({
      attacker: attacker as any,
      usable: skill,
      skill,
    })).toBe(false);
    expect(executeActionBattleUse({
      attacker: attacker as any,
      usable: projectileSkill,
      skill: projectileSkill,
    })).toBe(false);
    expect(attacker.sp).toBe(20);
    expect(onUse).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();

    attacker.hp = 10;
    expect(executeActionBattleUse({
      attacker: attacker as any,
      usable: skill,
      skill,
    })).toBe(true);
    expect(attacker.sp).toBe(15);
    expect(onUse).toHaveBeenCalledOnce();
    expect(executeActionBattleUse({
      attacker: attacker as any,
      usable: projectileSkill,
      skill: projectileSkill,
    })).toBe(true);
    expect(attacker.sp).toBe(10);
    expect(emit).toHaveBeenCalledOnce();
  });

  test("applies the standard skill effect when no onUse hook is defined", () => {
    const attacker = createEntity("caster");
    const target = createEntity("target");
    target.applyDamage.mockReturnValue({ damage: 25 });

    const handled = executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: {
        id: "fire",
        _type: "skill",
        spCost: 10,
        hitRate: 1,
      },
      skill: {
        id: "fire",
        _type: "skill",
        spCost: 10,
        hitRate: 1,
      },
    });

    expect(handled).toBe(true);
    expect(attacker.sp).toBe(90);
    expect(attacker.applyStates).toHaveBeenCalled();
    expect(target.applyDamage).toHaveBeenCalledWith(attacker, expect.objectContaining({ id: "fire" }));
  });

  test("forwards skill presentation through AI-owned hurt feedback", () => {
    const attacker = createEntity("caster");
    const handleDamage = vi.fn();
    const target = {
      ...createEntity("target"),
      battleAi: { handleDamage },
    };
    target.applyDamage.mockReturnValue({ damage: 25 });
    const skill = {
      id: "arcane",
      _type: "skill",
      spCost: 0,
      hitRate: 1,
      animation: "arcane-impact",
    };

    executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: skill,
      skill,
    });

    expect(handleDamage).toHaveBeenCalledWith(
      attacker,
      expect.objectContaining({
        skill: expect.objectContaining({
          animation: "arcane-impact",
        }),
      }),
    );
  });

  test("resolves reactive skill metadata before impact client transfer", () => {
    const packets: any[] = [];
    const attacker = {
      ...createEntity("caster"),
      getCurrentMap: () => ({
        clientVisual: (_id: string, payload: any) => {
          packets.push(structuredClone(payload));
        },
      }),
    };
    const target = createEntity("target");
    target.applyDamage.mockReturnValue({ damage: 25 });
    const skill = {
      id: () => "arcane",
      _type: () => "skill",
      name: () => "Arcane",
      spCost: () => 5,
      hitRate: () => 1,
      animation: () => "arcane-impact",
    };

    expect(() =>
      executeActionBattleUse({
        attacker: attacker as any,
        target: target as any,
        usable: skill,
        skill,
      })
    ).not.toThrow();

    expect(attacker.sp).toBe(95);
    expect(packets).toContainEqual(
      expect.objectContaining({
        moment: "hurt",
        skill: expect.objectContaining({
          id: "arcane",
          animation: "arcane-impact",
        }),
        result: expect.objectContaining({
          metadata: expect.objectContaining({
            actionId: "arcane",
            actionType: "skill",
          }),
        }),
      })
    );
  });

  test("consumes SP and resolves a failed skill without basic damage", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const attacker = {
      ...createEntity("caster"),
      getCurrentMap: () => ({
        clientVisual: vi.fn(),
      }),
    };
    const target = createEntity("target");

    const handled = executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: {
        id: "risky",
        _type: "skill",
        spCost: 5,
        hitRate: 0.95,
      },
      skill: {
        id: "risky",
        _type: "skill",
        spCost: 5,
        hitRate: 0.95,
      },
    });

    expect(handled).toBe(true);
    expect(attacker.sp).toBe(95);
    expect(target.applyDamage).not.toHaveBeenCalled();
  });

  test("parries skill damage before states and staggers the attacking AI", () => {
    const clientVisual = vi.fn();
    const stagger = vi.fn();
    const attacker = {
      ...createEntity("monster"),
      battleAi: { stagger },
      getCurrentMap: () => ({ clientVisual }),
    };
    const target = {
      ...createEntity("hero"),
      direction: "up",
    };
    beginActionBattleGuard(target, { parryWindowMs: 200 });

    executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: {
        id: "claw",
        _type: "skill",
        spCost: 0,
        hitRate: 1,
      },
      skill: {
        id: "claw",
        _type: "skill",
        spCost: 0,
        hitRate: 1,
      },
    });

    expect(target.applyDamage).not.toHaveBeenCalled();
    expect(attacker.applyStates).not.toHaveBeenCalled();
    expect(stagger).toHaveBeenCalledWith(650, target);
    expect(clientVisual).toHaveBeenCalledWith(
      "action-battle.visual",
      expect.objectContaining({ moment: "parry" })
    );
    clearActionBattleDefense(target);
  });

  test("lets onUse compose custom behavior with defaultEffect", () => {
    const attacker = createEntity("caster");
    const target = createEntity("target");
    target.applyDamage.mockReturnValue({ damage: 18 });
    const onUse = vi.fn((_user, _target, action) => {
      action.defaultEffect();
      action.heal(_user, 5);
    });

    executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: {
        id: "drain",
        _type: "skill",
        spCost: 4,
        hitRate: 1,
        onUse,
      },
      skill: {
        id: "drain",
        _type: "skill",
        spCost: 4,
        hitRate: 1,
        onUse,
      },
    });

    expect(onUse).toHaveBeenCalledOnce();
    expect(attacker.sp).toBe(96);
    expect(target.applyDamage).toHaveBeenCalledOnce();
  });

  test("applies default effects to action target arrays", () => {
    const attacker = createEntity("caster");
    const first = createEntity("first");
    const second = createEntity("second");
    first.applyDamage.mockReturnValue({ damage: 11 });
    second.applyDamage.mockReturnValue({ damage: 12 });

    executeActionBattleUse({
      attacker: attacker as any,
      target: [first as any, second as any],
      usable: {
        id: "burst",
        _type: "skill",
        spCost: 3,
        hitRate: 1,
      },
      skill: {
        id: "burst",
        _type: "skill",
        spCost: 3,
        hitRate: 1,
      },
    });

    expect(first.applyDamage).toHaveBeenCalledOnce();
    expect(second.applyDamage).toHaveBeenCalledOnce();
  });

  test("supports full custom heal skills without default damage", () => {
    const attacker = createEntity("healer");
    const target = createEntity("ally", 40);
    target.hp = 10;

    executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: {
        id: "heal",
        _type: "skill",
        spCost: 8,
        hitRate: 1,
        onUse(_user: any, ally: any, action: any) {
          action.heal(ally, 20);
        },
      },
      skill: {
        id: "heal",
        _type: "skill",
        spCost: 8,
        hitRate: 1,
      },
    });

    expect(attacker.sp).toBe(92);
    expect(target.hp).toBe(30);
    expect(target.applyDamage).not.toHaveBeenCalled();
  });

  test("applies the standard weapon effect for configured weapons", () => {
    const attacker = createEntity("monster");
    const target = createEntity("target");
    target.applyDamage.mockReturnValue({ damage: 12 });

    const handled = executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: {
        id: "claw",
        _type: "weapon",
        action: { mode: "instant", range: 40 },
      },
      weapon: {
        id: "claw",
        _type: "weapon",
      },
    });

    expect(handled).toBe(true);
    expect(target.applyDamage).toHaveBeenCalledWith(attacker, undefined);
  });

  test("defers the default effect until projectile impact", () => {
    const target = createEntity("target");
    target.applyDamage.mockReturnValue({ damage: 30 });
    const emitted = [{ id: "bolt-1" }];
    const emit = vi.fn(() => emitted);
    const attacker = {
      ...createEntity("caster"),
      equipments: () => [{ id: "bow" }],
      databaseById: (id: string) => id === "bow"
        ? { id, _type: "weapon", knockbackForce: 70 }
        : undefined,
      getCurrentMap: () => ({
        projectiles: {
          emit,
        },
      }),
    };
    const bolt = {
      id: "bolt",
      _type: "skill",
      spCost: 5,
      hitRate: 1,
      action: {
        mode: "projectile" as const,
        range: 200,
        visual: {
          trailFx: "torchFire",
        },
        projectile: {
          type: "bolt",
          speed: 200,
          range: 200,
        },
      },
    };

    executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: bolt,
      skill: bolt,
    });

    expect(target.applyDamage).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ trailFx: "torchFire" }),
      }),
      attacker
    );

    // Emission commits the projectile to the world. Defeating its caster does
    // not retroactively cancel that in-flight impact, but it prevents a new
    // combat entry from being emitted.
    attacker.hp = 0;
    handleActionBattleProjectileImpact({
      attacker: attacker as any,
      target: target as any,
      projectile: { id: "bolt-1" },
      hit: {},
      map: {},
    });

    expect(target.applyDamage).toHaveBeenCalledOnce();
    expect(executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: bolt,
      skill: bolt,
    })).toBe(false);
    expect(emit).toHaveBeenCalledOnce();
  });

  test("does not redirect a physics-only impact to the selected enemy", () => {
    const target = createEntity("enemy-behind-wall");
    target.applyDamage.mockReturnValue({ damage: 30 });
    const emit = vi.fn(() => [{ id: "wall-bolt-1" }]);
    const attacker = {
      ...createEntity("wall-caster"),
      getCurrentMap: () => ({ projectiles: { emit } }),
    };
    const bolt = {
      id: "wall-bolt",
      _type: "skill",
      spCost: 0,
      hitRate: 1,
      action: {
        target: "enemy" as const,
        mode: "projectile" as const,
        projectile: { speed: 200, range: 200 },
      },
    };

    expect(executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: bolt,
      skill: bolt,
    })).toBe(true);
    handleActionBattleProjectileImpact({
      attacker: attacker as any,
      projectile: { id: "wall-bolt-1" },
      hit: { entity: { uuid: "stone-wall" } },
      map: {},
    });

    expect(target.applyDamage).toHaveBeenCalledTimes(0);
    handleActionBattleProjectileDestroy("wall-bolt-1");
  });

  test("runs an explicitly authored impact hook with targetless wall context", () => {
    const target = createEntity("custom-enemy-behind-wall");
    const emit = vi.fn(() => [{ id: "custom-wall-bolt-1" }]);
    const attacker = {
      ...createEntity("custom-wall-caster"),
      getCurrentMap: () => ({ projectiles: { emit } }),
    };
    const impact = vi.fn((context: any, action: any) => {
      expect(context.target).toBeUndefined();
      expect(action.target).toBeNull();
      action.defaultEffect();
      action.damage();
    });
    const bolt = {
      id: "custom-wall-bolt",
      _type: "skill",
      spCost: 0,
      hitRate: 1,
      action: { target: "enemy" as const, mode: "projectile" as const },
      onUse(_user: any, _target: any, action: any) {
        action.projectile({ speed: 200, range: 200, onImpact: impact });
      },
    };

    executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: bolt,
      skill: bolt,
    });
    handleActionBattleProjectileImpact({
      attacker: attacker as any,
      projectile: { id: "custom-wall-bolt-1" },
      hit: { entity: { uuid: "stone-wall" } },
      map: {},
    });

    expect(impact).toHaveBeenCalledOnce();
    expect(target.applyDamage).not.toHaveBeenCalled();
    handleActionBattleProjectileDestroy("custom-wall-bolt-1");
  });

  test("uses the action target policy for projectile collisions", () => {
    const enemy = createEntity("enemy");
    (enemy as any).actionBattleFaction = "enemy";
    const ally = createEntity("ally");
    (ally as any).actionBattleFaction = "party";
    const emit = vi.fn(() => [{ id: "heal-bolt-1" }]);
    const attacker = {
      ...createEntity("caster"),
      actionBattleFaction: "party",
      getCurrentMap: () => ({
        projectiles: {
          emit,
        },
      }),
    };

    executeActionBattleUse({
      attacker: attacker as any,
      target: ally as any,
      usable: {
        id: "heal-bolt",
        _type: "skill",
        spCost: 5,
        hitRate: 1,
        action: {
          mode: "projectile",
          target: "ally",
          range: 200,
          projectile: {
            type: "heal",
            speed: 200,
          },
        },
      },
      skill: {
        id: "heal-bolt",
        _type: "skill",
        spCost: 5,
        hitRate: 1,
      },
    });

    const canHit = emit.mock.calls[0][0].canHit;
    expect(canHit({ entity: { uuid: ally.id }, target: ally })).toBe(true);
    expect(canHit({ entity: { uuid: enemy.id }, target: enemy })).toBe(false);
  });

  test("uses one explicit owner, ally, environment, and enemy projectile blocker policy", () => {
    const attacker = {
      ...createEntity("caster"),
      actionBattleFaction: "party",
    };
    const ally = {
      ...createEntity("ally"),
      actionBattleFaction: "party",
    };
    const enemy = {
      ...createEntity("enemy"),
      actionBattleFaction: "enemy",
    };
    const objects = new Map([
      [attacker.id, attacker],
      [ally.id, ally],
      [enemy.id, enemy],
    ]);
    const map = { getObjectById: (id: string) => objects.get(id) };
    const collide = (id: string, ignoreOwner = true) =>
      canActionBattleProjectileCollide({
        attacker: attacker as any,
        entity: { uuid: id },
        map,
        ignoreOwner,
        actionTarget: "enemy",
      });

    expect(collide("caster")).toBe(false);
    expect(collide("caster", false)).toBe(true);
    expect(collide("ally")).toBe(false);
    expect(collide("stone-wall")).toBe(true);
    expect(collide("enemy")).toBe(true);
  });

  test("passes projectile precision options to the generic projectile system", () => {
    const emit = vi.fn(() => [{ id: "bolt-1" }]);
    const attacker = {
      ...createEntity("caster"),
      getCurrentMap: () => ({
        projectiles: {
          emit,
        },
      }),
    };
    const target = {
      ...createEntity("target"),
      x: () => 100,
      y: () => 0,
    };

    executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: {
        id: "bolt",
        _type: "skill",
        spCost: 0,
        hitRate: 1,
        action: {
          mode: "projectile",
          projectile: {
            type: "bolt",
            speed: 200,
            range: 200,
            spreadDegrees: 20,
          },
        },
      },
      skill: {
        id: "bolt",
        _type: "skill",
        spCost: 0,
        hitRate: 1,
      },
    });

    expect(emit.mock.calls[0][0]).toMatchObject({
      direction: { x: 1, y: 0 },
      spreadDegrees: 20,
    });
  });

  test("uses the built-in projectile and serializes Studio presentation", () => {
    const emit = vi.fn(() => [{ id: "studio-bolt-1" }]);
    const attacker = {
      ...createEntity("caster"),
      getCurrentMap: () => ({
        tileWidth: 48,
        tileHeight: 48,
        projectiles: { emit },
      }),
    };

    executeActionBattleUse({
      attacker: attacker as any,
      usable: {
        id: "studio-bolt",
        _type: "skill",
        spCost: 0,
        targeting: { range: 6 },
        action: {
          mode: "projectile",
          projectile: {
            graphic: "fireball-spritesheet",
            scale: 1.4,
            rotateToDirection: false,
          },
        },
      },
      skill: {
        id: "studio-bolt",
        _type: "skill",
        spCost: 0,
        _skillInstance: {
          targeting: { range: 6 },
        },
      },
    });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "action-battle-skill",
        trajectory: {
          type: "linear",
          speed: 180,
          range: 288,
        },
        params: {
          graphic: "fireball-spritesheet",
          scale: 1.4,
          rotateToDirection: false,
        },
      }),
      attacker,
    );
  });

  test("derives projectile travel from configured rectangular targeting geometry", () => {
    setActionBattleOptions({
      ui: {
        targeting: {
          tileSize: { width: 10, height: 24 },
        },
      },
    });
    const emit = vi.fn(() => [{ id: "rectangular-bolt" }]);
    const attacker = {
      ...createEntity("caster"),
      getCurrentMap: () => ({
        tileWidth: 32,
        tileHeight: 32,
        projectiles: { emit },
      }),
    };
    const action = {
      mode: "projectile" as const,
      projectile: { direction: { x: 1, y: 0 } },
    };
    const skill = {
      id: "rectangular-bolt",
      _type: "skill",
      spCost: 0,
      targeting: { range: 3 },
      action,
    };

    expect(
      executeActionBattleUse({
        attacker: attacker as any,
        usable: skill,
        skill,
      }),
    ).toBe(true);
    expect(emit.mock.calls[0][0]).toMatchObject({
      direction: { x: 1, y: 0 },
      trajectory: { range: 30 },
    });

    action.projectile.direction = { x: 0, y: -1 };
    expect(
      executeActionBattleUse({
        attacker: attacker as any,
        usable: skill,
        skill,
      }),
    ).toBe(true);
    expect(emit.mock.calls[1][0]).toMatchObject({
      direction: { x: 0, y: -1 },
      trajectory: { range: 72 },
    });
  });

  test("uses the exact target direction for candidate-specific projectile travel", () => {
    setActionBattleOptions({
      ui: {
        targeting: {
          tileSize: { width: 10, height: 24 },
        },
      },
    });
    const emit = vi.fn(() => [{ id: "angled-bolt" }]);
    const attacker = {
      ...createEntity("caster"),
      getCurrentMap: () => ({ projectiles: { emit } }),
    };
    const target = {
      ...createEntity("target"),
      x: () => 26,
      y: () => 12,
    };
    const skill = {
      id: "angled-bolt",
      _type: "skill",
      spCost: 0,
      targeting: { range: 3 },
      action: { mode: "projectile" as const },
    };

    expect(
      executeActionBattleUse({
        attacker: attacker as any,
        target: target as any,
        usable: skill,
        skill,
      }),
    ).toBe(true);

    const distance = Math.hypot(26, 12);
    const direction = { x: 26 / distance, y: 12 / distance };
    const range = 3 / (Math.abs(direction.x) / 10 + Math.abs(direction.y) / 24);
    expect(emit.mock.calls[0][0].direction).toMatchObject({
      x: expect.closeTo(direction.x),
      y: expect.closeTo(direction.y),
    });
    expect(emit.mock.calls[0][0].trajectory.range).toBeCloseTo(range);
    expect(emit.mock.calls[0][0].trajectory.range).toBeLessThan(distance);
  });

  test("emits the same authored origin, normalized direction, radius, and trajectory range used for admission", () => {
    const emit = vi.fn(() => [{ id: "authored-bolt" }]);
    const attacker = {
      ...createEntity("caster"),
      getCurrentMap: () => ({
        tileWidth: 10,
        tileHeight: 24,
        projectiles: { emit },
      }),
    };
    const target = {
      ...createEntity("target"),
      x: () => 20,
      y: () => 20,
    };
    const skill = {
      id: "authored-bolt",
      _type: "skill",
      spCost: 0,
      targeting: { range: 3 },
      action: {
        mode: "projectile" as const,
        range: 30,
        projectile: {
          origin: { x: 0, y: 24 },
          direction: { x: 7, y: 0 },
          trajectory: { type: "linear", speed: 120, range: 5 },
          collision: { width: 4 },
        },
      },
    };

    expect(executeActionBattleUse({
      attacker: attacker as any,
      target: target as any,
      usable: skill,
      skill,
    })).toBe(true);
    expect(emit.mock.calls[0][0]).toMatchObject({
      origin: { x: 0, y: 24 },
      direction: { x: 1, y: 0 },
      trajectory: { type: "linear", speed: 120, range: 5 },
      collision: { width: 4, radius: 2 },
    });
  });
});
