import { afterEach, describe, expect, test, vi } from "vitest";
import { ACTION_BATTLE_CLIENT_VISUAL_ID } from "./visual";
import {
  ACTION_BATTLE_DODGE,
  ACTION_BATTLE_GUARD_START,
  ACTION_BATTLE_HOTBAR_USE,
  ACTION_BATTLE_SKILL_USE,
  createActionBattleServer,
} from "./server";
import { hasActionBattleControl } from "./core/control-state";
import { isActionBattleGuarding } from "./core/defense";
import { isActionBattleEntityInvincible } from "./core/hit-reaction";

describe("action battle player visuals", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("resolves configured player attack animations on the server", () => {
    vi.useFakeTimers();
    const clientVisual = vi.fn();
    const map = {
      clientVisual,
      getEvents: () => [],
      getPlayers: () => [],
      queryHitbox: () => [],
      stopMovement: vi.fn(),
    };
    const player = {
      id: "hero",
      canMove: true,
      directionFixed: false,
      animationFixed: false,
      pendingInputs: [],
      lastProcessedInputTs: 0,
      studioCombatAnimations: {
        attack: "studio-hero-attack",
      },
      x: () => 100,
      y: () => 120,
      hitbox: () => ({ w: 32, h: 32 }),
      getDirection: () => "down",
      changeDirection: vi.fn(),
      getCurrentMap: () => map,
      equipments: () => [],
      setGraphicAnimation: vi.fn(),
    };
    const server = createActionBattleServer({
      attack: {
        profile: {
          activeMs: 1,
          recoveryMs: 0,
          control: {
            movementLock: "none",
            directionLock: "none",
          },
        },
      },
      animations: {
        attack(entity) {
          return {
            animationName: "attack",
            graphic: entity.studioCombatAnimations.attack,
            repeat: 1,
          };
        },
      },
    });

    (server.player?.onInput as any)(player, {
      action: "action",
      data: { direction: "down" },
    });

    expect(clientVisual).toHaveBeenCalledWith(
      ACTION_BATTLE_CLIENT_VISUAL_ID,
      expect.objectContaining({
        moment: "attack",
        objectId: "hero",
        animations: {
          attack: {
            animationName: "attack",
            graphic: "studio-hero-attack",
            repeat: 1,
          },
        },
      })
    );

    vi.runAllTimers();

    expect(player.animationFixed).toBe(false);
    expect(player.setGraphicAnimation).not.toHaveBeenCalledWith("stand");
  });

  test("launches an equipped projectile weapon without melee contact", () => {
    vi.useFakeTimers();
    const emit = vi.fn(() => [{ id: "arrow-1" }]);
    const weapon = {
      id: "longbow",
      _type: "weapon",
      action: {
        mode: "projectile",
        target: "enemy",
        projectile: { type: "arrow", speed: 240, range: 320 },
      },
    };
    const nearbyEnemy = {
      id: "nearby-enemy",
      hp: 100,
      x: () => 132,
      y: () => 120,
      hitbox: () => ({ w: 32, h: 32 }),
      applyDamage: vi.fn(),
      battleAi: {
        getFaction: () => "enemies",
        handleDamage: vi.fn(),
      },
    };
    const map = {
      clientVisual: vi.fn(),
      getEvents: () => [nearbyEnemy],
      getPlayers: () => [],
      queryHitbox: vi.fn(() => [nearbyEnemy]),
      stopMovement: vi.fn(),
      projectiles: { emit },
    };
    const player = {
      id: "archer",
      canMove: true,
      directionFixed: false,
      animationFixed: false,
      pendingInputs: [],
      lastProcessedInputTs: 0,
      x: () => 100,
      y: () => 120,
      hitbox: () => ({ w: 32, h: 32 }),
      getDirection: () => "right",
      changeDirection: vi.fn(),
      getCurrentMap: () => map,
      equipments: () => [{ id: weapon.id }],
      databaseById: (id: string) => id === weapon.id ? weapon : undefined,
    };
    const server = createActionBattleServer({
      combat: {
        attack: {
          profile: {
            startupMs: 32,
            activeMs: 40,
            recoveryMs: 0,
            control: {
              movementLock: "none",
              directionLock: "none",
            },
          },
        },
      },
    });

    (server.player?.onInput as any)(player, {
      action: "action",
      data: { direction: "right" },
    });

    expect(emit).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    vi.advanceTimersToNextTimer();
    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "arrow",
        trajectory: expect.objectContaining({
          speed: 240,
          range: 320,
        }),
      }),
      player,
    );

    vi.runAllTimers();
    expect(map.queryHitbox).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledOnce();
    expect(nearbyEnemy.applyDamage).not.toHaveBeenCalled();
  });

  test("validates learned skills and cooldowns on the server", () => {
    vi.useFakeTimers();
    const onUse = vi.fn();
    const skill = {
      id: "focus",
      _type: "skill",
      name: "Focus",
      spCost: 4,
      hitRate: 1,
      key: "1",
      targeting: { range: 0 },
      action: {
        mode: "instant",
        target: "self",
        cooldownMs: 350,
      },
      onUse,
    };
    const player = {
      id: "hero",
      sp: 10,
      skills: () => [{ id: "focus" }],
      getSkill: (id: string) => id === skill.id ? skill : null,
      databaseById: (id: string) => id === skill.id ? skill : null,
      hasEffect: () => false,
      clientVisual: vi.fn(),
      getGui: () => null,
      getCurrentMap: () => null,
    };
    const server = createActionBattleServer();
    const useSkill = () =>
      (server.player?.onInput as any)(player, {
        action: ACTION_BATTLE_SKILL_USE,
        data: { id: "focus" },
      });

    useSkill();
    useSkill();

    expect(onUse).toHaveBeenCalledTimes(1);
    expect(player.sp).toBe(6);

    vi.advanceTimersByTime(350);
    useSkill();

    expect(onUse).toHaveBeenCalledTimes(2);
    expect(player.sp).toBe(2);

    (server.player?.onInput as any)(player, {
      action: ACTION_BATTLE_SKILL_USE,
      data: { id: "unknown" },
    });
    expect(onUse).toHaveBeenCalledTimes(2);
  });

  test("rejects CAN_NOT_SKILL before Action Battle execution and cooldown", () => {
    vi.useFakeTimers();
    let restricted = true;
    const onUse = vi.fn();
    const skill = {
      id: "sealed-focus",
      _type: "skill",
      spCost: 4,
      hitRate: 1,
      action: {
        mode: "instant",
        target: "self",
        cooldownMs: 350,
      },
      onUse,
    };
    const player = {
      id: "hero",
      sp: 10,
      skills: () => [{ id: skill.id }],
      getSkill: (id: string) => id === skill.id ? skill : null,
      databaseById: (id: string) => id === skill.id ? skill : null,
      hasEffect: (effect: string) =>
        restricted && effect === "CAN_NOT_SKILL",
      clientVisual: vi.fn(),
      getGui: () => null,
      getCurrentMap: () => null,
    };
    const server = createActionBattleServer();
    const useSkill = () =>
      (server.player?.onInput as any)(player, {
        action: ACTION_BATTLE_SKILL_USE,
        data: { id: skill.id },
      });

    useSkill();
    useSkill();
    expect(onUse).not.toHaveBeenCalled();
    expect(player.sp).toBe(10);
    expect(vi.getTimerCount()).toBe(0);

    restricted = false;
    useSkill();
    expect(onUse).toHaveBeenCalledOnce();
    expect(player.sp).toBe(6);
    expect(vi.getTimerCount()).toBe(1);
  });

  test("preserves skill cooldowns across death and map lifecycle resets", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const onUse = vi.fn();
    const skill = {
      id: "steady-focus",
      _type: "skill",
      spCost: 0,
      hitRate: 1,
      action: { mode: "instant", target: "self", cooldownMs: 350 },
      onUse,
    };
    const player = {
      id: "hero",
      hp: 10,
      sp: 10,
      skills: () => [{ id: skill.id }],
      getSkill: (id: string) => id === skill.id ? skill : null,
      databaseById: (id: string) => id === skill.id ? skill : null,
      hasEffect: () => false,
      clientVisual: vi.fn(),
      getGui: () => null,
      getCurrentMap: () => null,
    };
    const server = createActionBattleServer();
    const useSkill = () =>
      (server.player?.onInput as any)(player, {
        action: ACTION_BATTLE_SKILL_USE,
        data: { id: skill.id },
      });

    useSkill();
    (server.player?.onDead as any)(player);
    (server.player?.onLeaveMap as any)(player);
    (server.player?.onJoinMap as any)(player);
    useSkill();

    expect(onUse).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(350);
    useSkill();

    expect(onUse).toHaveBeenCalledTimes(2);
  });

  test("rejects locked and disallowed hotbar skills before execution", () => {
    const onUse = vi.fn();
    const skill = {
      id: "locked-focus",
      _type: "skill",
      name: "Locked Focus",
      spCost: 4,
      hitRate: 1,
      action: { mode: "instant", target: "self", cooldownMs: 350 },
      onUse,
    };
    const player = {
      id: "hero",
      sp: 10,
      skills: () => [{ id: skill.id }],
      getSkill: (id: string) => id === skill.id ? skill : null,
      databaseById: (id: string) => id === skill.id ? skill : null,
      hasEffect: () => false,
      clientVisual: vi.fn(),
      getGui: () => null,
      getCurrentMap: () => null,
      getHotbar: () => ({
        capacity: 1,
        activeSlot: null,
        slots: [null, { type: "skill", id: skill.id }],
      }),
      validateHotbarSlot: vi.fn()
        .mockImplementationOnce(() => {
          throw new RangeError("Hotbar slot 1 is locked");
        })
        .mockImplementationOnce(() => {
          throw new Error('Hotbar entry type "skill" is not allowed');
        })
        .mockReturnValue({ type: "skill", id: skill.id }),
      useHotbarSlot: vi.fn(),
    };
    const server = createActionBattleServer();

    const useSlot = () => (server.player?.onInput as any)(player, {
        action: ACTION_BATTLE_HOTBAR_USE,
        data: { slot: 1 },
      });

    useSlot();
    useSlot();
    expect(onUse).not.toHaveBeenCalled();
    expect(player.sp).toBe(10);

    useSlot();

    expect(player.validateHotbarSlot).toHaveBeenCalledTimes(3);
    expect(player.validateHotbarSlot).toHaveBeenCalledWith(1);
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(player.sp).toBe(6);
    expect(player.useHotbarSlot).not.toHaveBeenCalled();
  });

  test("validates manual targets with the configured client tile geometry", () => {
    const onUse = vi.fn();
    const skill = {
      id: "cross-cut",
      _type: "skill",
      spCost: 0,
      hitRate: 1,
      targeting: { range: 1, aoeMask: ["#"] },
      action: { mode: "melee", target: "enemy" },
      onUse,
    };
    const enemy = {
      id: "enemy",
      hp: 10,
      x: () => 26,
      y: () => 24,
      hitbox: () => ({ w: 8, h: 8 }),
      battleAi: {
        getFaction: () => "enemies",
      },
    };
    const map = {
      tileWidth: 32,
      tileHeight: 32,
      getEvents: () => [enemy],
      getPlayers: () => [],
    };
    const player = {
      id: "hero",
      hp: 10,
      sp: 10,
      x: () => 16,
      y: () => 24,
      hitbox: () => ({ w: 8, h: 8 }),
      skills: () => [{ id: skill.id }],
      getSkill: (id: string) => id === skill.id ? skill : null,
      databaseById: (id: string) => id === skill.id ? skill : null,
      hasEffect: () => false,
      clientVisual: vi.fn(),
      getGui: () => null,
      getCurrentMap: () => map,
    };
    const server = createActionBattleServer({
      ui: {
        targeting: {
          tileSize: { width: 10, height: 14 },
        },
      },
    });

    (server.player?.onInput as any)(player, {
      action: ACTION_BATTLE_SKILL_USE,
      data: { id: skill.id, target: { x: 3, y: 2 } },
    });

    expect(onUse).toHaveBeenCalledWith(
      player,
      [enemy],
      expect.objectContaining({ target: [enemy] }),
    );
  });

  test("soft-targets vertically through configured rectangular tile reach", () => {
    const onUse = vi.fn();
    const skill = {
      id: "downrange-bolt",
      _type: "skill",
      spCost: 0,
      hitRate: 1,
      targeting: { range: 3 },
      action: { mode: "projectile", target: "enemy" },
      onUse,
    };
    const enemy = {
      id: "enemy",
      hp: 10,
      x: () => 0,
      y: () => 50,
      hitbox: () => ({ w: 8, h: 8 }),
      battleAi: {
        getFaction: () => "enemies",
      },
    };
    const map = {
      tileWidth: 32,
      tileHeight: 32,
      getEvents: () => [enemy],
      getPlayers: () => [],
    };
    const player = {
      id: "hero",
      hp: 10,
      sp: 10,
      x: () => 0,
      y: () => 0,
      hitbox: () => ({ w: 8, h: 8 }),
      getDirection: () => "down",
      skills: () => [{ id: skill.id }],
      getSkill: (id: string) => id === skill.id ? skill : null,
      databaseById: (id: string) => id === skill.id ? skill : null,
      hasEffect: () => false,
      clientVisual: vi.fn(),
      getGui: () => null,
      getCurrentMap: () => map,
    };
    const server = createActionBattleServer({
      ui: {
        targeting: {
          tileSize: { width: 10, height: 24 },
        },
      },
    });

    (server.player?.onInput as any)(player, {
      action: ACTION_BATTLE_SKILL_USE,
      data: { id: skill.id },
    });

    expect(onUse).toHaveBeenCalledWith(
      player,
      enemy,
      expect.objectContaining({ target: enemy }),
    );
  });

  test("opens or hides the hotbar from the per-player resolver on map changes", () => {
    const player = {
      initializeHotbar: vi.fn(),
      showHotbar: vi.fn(),
      hideHotbar: vi.fn(),
      enabled: true,
    };
    const server = createActionBattleServer({
      ui: {
        hotbar: {
          enabled: current => (current as any).enabled,
          autoOpen: true,
          capacity: () => 6,
          allowedEntryTypes: ["item"],
        },
      },
    });

    (server.player?.onJoinMap as any)(player);
    expect(player.showHotbar).toHaveBeenCalledWith(expect.objectContaining({
      capacity: expect.any(Function),
      allowedEntryTypes: ["item"],
    }));

    player.enabled = false;
    (server.player?.onJoinMap as any)(player);
    expect(player.hideHotbar).toHaveBeenCalledTimes(1);
  });
});

const createBufferedComboHarness = () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);

  let connected = true;
  let currentMap: any;
  const clientVisual = vi.fn();
  const player: any = {
    id: "buffered-hero",
    hp: 10,
    canMove: true,
    directionFixed: false,
    animationFixed: false,
    pendingInputs: [],
    lastProcessedInputTs: 0,
    x: () => 100,
    y: () => 120,
    hitbox: () => ({ w: 32, h: 32 }),
    getDirection: () => "down",
    changeDirection: vi.fn(),
    getCurrentMap: () => currentMap,
    equipments: () => [],
  };
  const createMap = () => {
    const map: any = {
      clientVisual,
      getEvents: () => [],
      getPlayers: () => connected && currentMap === map ? [player] : [],
      getPlayer: (id: string) =>
        connected && currentMap === map && id === player.id
          ? player
          : undefined,
      queryHitbox: () => [],
      stopMovement: vi.fn(),
    };
    return map;
  };
  const originMap = createMap();
  const destinationMap = createMap();
  currentMap = originMap;

  const attackStep = {
    startupMs: 0,
    activeMs: 1,
    recoveryMs: 49,
    control: {
      movementLock: "full" as const,
      directionLock: "full" as const,
    },
  };
  const server = createActionBattleServer({
    attack: { profile: attackStep },
    combat: {
      player: {
        combo: {
          enabled: true,
          bufferMs: 150,
          resetMs: 700,
          steps: [attackStep, attackStep],
        },
        chargedAttack: {
          enabled: true,
          maxChargeMs: 900,
        },
        dodge: {
          enabled: true,
          cooldownMs: 650,
          invincibilityMs: 220,
        },
        guard: {
          enabled: true,
        },
      },
    },
  });
  const pressAction = () => (server.player?.onInput as any)(player, {
    action: "action",
    data: { direction: "down" },
  });
  const queueCombo = (remainingMs = 100) => {
    player.__actionBattleAttackLockedUntil = Date.now() + remainingMs;
    player.__actionBattleAttackActiveUntil = Date.now();
    pressAction();
  };
  const attackCount = () => clientVisual.mock.calls.filter(
    ([, payload]) => payload?.moment === "attack",
  ).length;
  const attackPatterns = () => clientVisual.mock.calls
    .filter(([, payload]) => payload?.moment === "attack")
    .map(([, payload]) => payload.pattern);
  const visualCount = (moment: string) => clientVisual.mock.calls.filter(
    ([, payload]) => payload?.moment === moment,
  ).length;

  return {
    server,
    player,
    originMap,
    destinationMap,
    pressAction,
    queueCombo,
    attackCount,
    attackPatterns,
    visualCount,
    disconnect: () => {
      connected = false;
    },
    setConnected: (value: boolean) => {
      connected = value;
    },
    setCurrentMap: (map: any) => {
      currentMap = map;
    },
  };
};

describe("action battle buffered combo lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("invalidates a buffered combo when the player dies", () => {
    const harness = createBufferedComboHarness();
    harness.queueCombo();
    expect(vi.getTimerCount()).toBe(1);

    harness.player.hp = 0;
    (harness.server.player?.onDead as any)(harness.player);

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(200);
    expect(harness.attackCount()).toBe(0);
  });

  test("invalidates a buffered combo when the player disconnects", () => {
    const harness = createBufferedComboHarness();
    harness.queueCombo();
    harness.disconnect();

    (harness.server.player?.onDisconnected as any)(harness.player);

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(200);
    expect(harness.attackCount()).toBe(0);
  });

  test("invalidates a buffered combo across a map transition", () => {
    const harness = createBufferedComboHarness();
    harness.queueCombo();

    (harness.server.player?.onLeaveMap as any)(
      harness.player,
      harness.originMap,
    );
    harness.setCurrentMap(harness.destinationMap);
    (harness.server.player?.onJoinMap as any)(
      harness.player,
      harness.destinationMap,
    );

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(200);
    expect(harness.attackCount()).toBe(0);
  });

  test("starts the destination map with an immediate step-zero attack", () => {
    const harness = createBufferedComboHarness();
    harness.pressAction();

    expect(harness.attackPatterns()).toEqual(["combo-1"]);
    expect(harness.player.__actionBattleAttackLockedUntil).toBeGreaterThan(
      Date.now(),
    );
    expect(harness.player.__actionBattleAttackProfile).toBeDefined();
    expect(hasActionBattleControl(harness.player, "attack")).toBe(true);
    expect(harness.player.canMove).toBe(false);
    expect(harness.player.directionFixed).toBe(true);
    expect(harness.player.animationFixed).toBe(true);

    (harness.server.player?.onLeaveMap as any)(
      harness.player,
      harness.originMap,
    );
    harness.setCurrentMap(harness.destinationMap);
    (harness.server.player?.onJoinMap as any)(
      harness.player,
      harness.destinationMap,
    );

    expect(harness.player.__actionBattleAttackLockedUntil).toBe(0);
    expect(harness.player.__actionBattleAttackActiveUntil).toBe(0);
    expect(harness.player.__actionBattleAttackProfile).toBeUndefined();
    expect(hasActionBattleControl(harness.player, "attack")).toBe(false);
    expect(harness.player.canMove).toBe(true);
    expect(harness.player.directionFixed).toBe(false);
    expect(harness.player.animationFixed).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    harness.pressAction();

    expect(harness.attackPatterns()).toEqual(["combo-1", "combo-1"]);
  });

  test("rapid death and revival cannot resume attack recovery or combo state", () => {
    const harness = createBufferedComboHarness();
    harness.pressAction();
    harness.pressAction();
    expect(harness.attackPatterns()).toEqual(["combo-1"]);

    harness.player.hp = 0;
    (harness.server.player?.onDead as any)(harness.player);
    harness.player.hp = 10;

    expect(harness.player.__actionBattleAttackLockedUntil).toBe(0);
    expect(harness.player.__actionBattleAttackActiveUntil).toBe(0);
    expect(harness.player.__actionBattleAttackProfile).toBeUndefined();
    expect(hasActionBattleControl(harness.player, "attack")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    harness.pressAction();

    expect(harness.attackPatterns()).toEqual(["combo-1", "combo-1"]);
    vi.advanceTimersByTime(51);
    expect(harness.attackCount()).toBe(2);
  });

  test("connection reset clears charge, guard, dodge, and their controls", () => {
    const harness = createBufferedComboHarness();
    const input = (action: string) =>
      (harness.server.player?.onInput as any)(harness.player, { action });

    input("action-battle:charge-start");
    input(ACTION_BATTLE_GUARD_START as string);
    input(ACTION_BATTLE_DODGE);

    expect(harness.visualCount("chargeStart")).toBe(1);
    expect(isActionBattleGuarding(harness.player)).toBe(true);
    expect(hasActionBattleControl(harness.player, "guard")).toBe(true);
    expect(harness.player.__actionBattleDodgeLockedUntil).toBeGreaterThan(
      Date.now(),
    );
    expect(isActionBattleEntityInvincible(harness.player)).toBe(true);

    (harness.server.player?.onConnected as any)(harness.player);

    expect(isActionBattleGuarding(harness.player)).toBe(false);
    expect(hasActionBattleControl(harness.player, "guard")).toBe(false);
    expect(harness.player.directionFixed).toBe(false);
    expect(harness.player.animationFixed).toBe(false);
    expect(harness.player.__actionBattleDodgeLockedUntil).toBe(0);
    expect(isActionBattleEntityInvincible(harness.player)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    input("action-battle:charge-release");
    expect(harness.visualCount("chargeRelease")).toBe(0);
    input("action-battle:charge-start");
    expect(harness.visualCount("chargeStart")).toBe(2);
  });

  test("disconnect and reconnect leave no stale runtime on the player", () => {
    const harness = createBufferedComboHarness();
    harness.pressAction();
    harness.pressAction();
    harness.disconnect();

    (harness.server.player?.onDisconnected as any)(harness.player);

    expect(harness.player.__actionBattleAttackLockedUntil).toBe(0);
    expect(harness.player.__actionBattleAttackActiveUntil).toBe(0);
    expect(harness.player.__actionBattleAttackProfile).toBeUndefined();
    expect(harness.player.__actionBattleDodgeLockedUntil).toBe(0);
    expect(hasActionBattleControl(harness.player)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    harness.setConnected(true);
    (harness.server.player?.onConnected as any)(harness.player);
    harness.pressAction();

    expect(harness.attackPatterns()).toEqual(["combo-1", "combo-1"]);
  });

  test("fails closed when the player no longer has a current map", () => {
    const harness = createBufferedComboHarness();
    harness.queueCombo();
    harness.setCurrentMap(null);

    vi.advanceTimersByTime(101);

    expect(harness.attackCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("fails closed when the originating map no longer owns the player", () => {
    const harness = createBufferedComboHarness();
    harness.queueCombo();
    harness.disconnect();

    vi.advanceTimersByTime(101);

    expect(harness.attackCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("replaces an obsolete buffer before queuing the next combo", () => {
    const harness = createBufferedComboHarness();
    harness.queueCombo(100);

    harness.player.__actionBattleAttackLockedUntil = Date.now();
    harness.pressAction();
    expect(harness.attackCount()).toBe(1);

    vi.advanceTimersByTime(10);
    harness.pressAction();
    vi.advanceTimersByTime(41);
    expect(harness.attackCount()).toBe(2);

    vi.advanceTimersByTime(100);
    expect(harness.attackCount()).toBe(2);
  });

  test("executes an uncontested buffered combo exactly once", () => {
    const harness = createBufferedComboHarness();
    harness.queueCombo();

    vi.advanceTimersByTime(100);
    expect(harness.attackCount()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(harness.attackCount()).toBe(1);

    vi.runAllTimers();
    expect(harness.attackCount()).toBe(1);
  });
});
