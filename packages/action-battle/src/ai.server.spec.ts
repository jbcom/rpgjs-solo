import { MAXHP } from "@rpgjs/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { I18nService, PhysicsEngine } from "@rpgjs/common";
import {
  AiDebug,
  AiState,
  AttackPattern,
  BattleAi,
  EnemyType,
} from "./ai.server";
import {
  callAction,
  chase,
  holdPosition,
  idle,
  ifTargetVisible,
  moveToPoint,
  once,
  phase,
  run,
  setSpeed,
  teleportNearTarget,
  teleportTo,
  useAttack,
  useSkill,
  visual,
} from "./core/ai-behavior-tree";
import {
  getActionBattleAiPendingExecutionCountForTests,
} from "./core/ai-intent-execution";
import { setActionBattleSystems } from "./core/context";
import { ACTION_BATTLE_CLIENT_VISUAL_ID } from "./visual";
import { ACTION_BATTLE_I18N_KEYS } from "./i18n";

const createEvent = () => ({
  id: "monster-1",
  hp: 10,
  param: {
    [MAXHP]: 10,
  },
  attachShape: vi.fn(),
  flash: vi.fn(),
  showHit: vi.fn(),
  setGraphicAnimation: vi.fn(),
  mergeComponents: vi.fn(),
  componentsTop: vi.fn(() => null),
  stopMoveTo: vi.fn(),
  moveTo: vi.fn(),
  teleport: vi.fn(async () => undefined),
  speed: 4,
  getCurrentMap: vi.fn(() => ({})),
  remove: vi.fn(),
  x: vi.fn(() => 0),
  y: vi.fn(() => 0),
  direction: vi.fn(() => "down"),
  changeDirection: vi.fn(),
});

const createPlayer = () => ({
  id: "player-1",
  exp: 0,
  gold: 0,
  addItem: vi.fn(() => ({ name: () => "Potion" })),
  showNotification: vi.fn(),
  getCurrentMap: vi.fn(() => ({
    database: () => ({
      potion: { icon: "potion-icon" },
    }),
  })),
});

describe("AiDebug", () => {
  test("emits structured and filtered decision logs only when enabled", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    AiDebug.enabled = false;
    AiDebug.filterEventId = null;
    AiDebug.categories = [];

    AiDebug.log("decision", "enemy-1", "disabled");
    expect(debug).not.toHaveBeenCalled();

    AiDebug.enabled = true;
    AiDebug.filterEventId = "enemy-1";
    AiDebug.categories = ["decision"];
    AiDebug.log("movement", "enemy-1", "filtered category");
    AiDebug.log("decision", "enemy-2", "filtered enemy");
    AiDebug.log("decision", "enemy-1", "selected", { id: "fireball" });

    expect(debug).toHaveBeenCalledOnce();
    expect(debug).toHaveBeenCalledWith(
      "[ActionBattle AI]",
      expect.objectContaining({
        category: "decision",
        eventId: "enemy-1",
        message: "selected",
        data: { id: "fireball" },
      })
    );

    AiDebug.enabled = false;
    AiDebug.filterEventId = null;
    AiDebug.categories = [];
    debug.mockRestore();
  });
});

describe("BattleAi health presentation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setActionBattleSystems({});
  });

  test("reuses the standard RPGJS HP component above the entity graphic", () => {
    const event = createEvent();
    const ai = new BattleAi(event as any, {
      presentation: {
        role: "boss",
        healthBar: {
          style: { width: 120, fillColor: "#cc2244" },
        },
      },
    });

    expect(event.mergeComponents).toHaveBeenCalledWith(
      "top",
      [
        expect.objectContaining({
          id: "rpg:hpBar",
          props: expect.objectContaining({
            style: expect.objectContaining({
              width: 120,
              height: 9,
              fillColor: "#cc2244",
            }),
            text: undefined,
          }),
        }),
      ],
      expect.objectContaining({
        width: 120,
        marginBottom: 4,
      })
    );
    ai.destroy();
  });

  test("can disable the standard HP component for one AI", () => {
    const event = createEvent();
    const ai = new BattleAi(event as any, {
      presentation: { healthBar: false },
    });

    expect(event.mergeComponents).not.toHaveBeenCalled();
    ai.destroy();
  });

  test("does not duplicate an HP component already supplied by the game", () => {
    const event = createEvent();
    event.componentsTop.mockReturnValue(
      JSON.stringify({
        components: [[{ id: "rpg:hpBar", type: "hpBar" }]],
        layout: {},
      })
    );
    const ai = new BattleAi(event as any);

    expect(event.mergeComponents).not.toHaveBeenCalled();
    ai.destroy();
  });

  test("keeps the skill impact media in AI-owned hurt visuals", () => {
    const clientVisual = vi.fn();
    const event = createEvent();
    event.hp = 10;
    event.getCurrentMap.mockReturnValue({ clientVisual });
    const ai = new BattleAi(event as any);

    ai.handleDamage(createPlayer() as any, {
      damage: 3,
      defeated: false,
      skill: {
        id: "arcane",
        name: "Arcane",
        animation: "arcane-impact",
      },
    });

    expect(clientVisual).toHaveBeenCalledWith(
      ACTION_BATTLE_CLIENT_VISUAL_ID,
      expect.objectContaining({
        moment: "hurt",
        skill: expect.objectContaining({
          id: "arcane",
          animation: "arcane-impact",
        }),
      }),
    );
    ai.destroy();
  });
});

describe("BattleAi defeat flow", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setActionBattleSystems({});
  });

  test("awards the attacker and requests a defeated remove transition", () => {
    const event = createEvent();
    const attacker = createPlayer();
    const ai = new BattleAi(event as any, {
      animations: {
        die: {
          animationName: "die",
          repeat: 1,
          delayMs: 700,
        },
      },
      rewards: {
        exp: 25,
        gold: 7,
        items: [
          {
            itemId: "potion",
            amount: 2,
            chance: 100,
          },
        ],
        showNotification: true,
      },
    });

    expect(ai.handleDamage(attacker as any, { damage: 10, defeated: true })).toBe(true);

    expect(attacker.exp).toBe(25);
    expect(attacker.gold).toBe(7);
    expect(attacker.addItem).toHaveBeenCalledWith("potion", 2);
    expect(attacker.showNotification).toHaveBeenNthCalledWith(1, {
      key: ACTION_BATTLE_I18N_KEYS.rewardCurrency,
      params: { experience: 25, gold: 7 },
    });
    expect(attacker.showNotification).toHaveBeenNthCalledWith(
      2,
      {
        key: ACTION_BATTLE_I18N_KEYS.rewardNamedItem,
        count: 2,
        params: { count: 2, item: "Potion" },
      },
      { icon: "potion-icon" }
    );
    expect(event.setGraphicAnimation).not.toHaveBeenCalledWith("die", 1);
    expect(event.remove).toHaveBeenCalledWith({
      reason: "defeated",
      data: {
        animation: expect.objectContaining({
          animationName: "die",
          delayMs: 700,
        }),
        deathPresentation: {
          effect: "explosionSmall",
          durationMs: 450,
          scale: 1.4,
          shake: true,
        },
      },
      transition: {
        animation: "die",
        graphic: undefined,
        effect: "explosionSmall",
        duration: 700,
      },
      timeoutMs: 700,
    });
  });

  test("defers plural category and authored item-name translation to the client", () => {
    const event = createEvent();
    const attacker = createPlayer();
    const ai = new BattleAi(event as any, {
      rewards: {
        items: [
          {
            itemId: "potion",
            itemNameKey: "game.item.potion",
            amount: 1,
            chance: 100,
          },
          {
            itemId: "potion",
            itemNameKey: "game.item.potion",
            amount: 3,
            chance: 100,
          },
        ],
        showNotification: true,
      },
    });

    ai.handleDamage(attacker as any, { damage: 10, defeated: true });

    expect(attacker.showNotification).toHaveBeenNthCalledWith(
      1,
      {
        key: ACTION_BATTLE_I18N_KEYS.rewardNamedItem,
        count: 1,
        params: { count: 1, item: { key: "game.item.potion" } },
      },
      { icon: "potion-icon" }
    );
    expect(attacker.showNotification).toHaveBeenNthCalledWith(
      2,
      {
        key: ACTION_BATTLE_I18N_KEYS.rewardNamedItem,
        count: 3,
        params: { count: 3, item: { key: "game.item.potion" } },
      },
      { icon: "potion-icon" }
    );
  });

  test("preserves the resolved database item name when no localization key is authored", () => {
    const event = createEvent();
    const attacker = createPlayer();
    const ai = new BattleAi(event as any, {
      rewards: {
        items: [{ itemId: "potion", amount: 2, chance: 100 }],
        showNotification: true,
      },
    });

    ai.handleDamage(attacker as any, { damage: 10, defeated: true });

    expect(attacker.showNotification).toHaveBeenCalledWith(
      {
        key: ACTION_BATTLE_I18N_KEYS.rewardNamedItem,
        count: 2,
        params: { count: 2, item: "Potion" },
      },
      { icon: "potion-icon" }
    );
  });

  test("uses a localized generic item key when no reward display name exists", () => {
    const event = createEvent();
    const attacker = createPlayer();
    attacker.addItem.mockReturnValue(undefined);
    const ai = new BattleAi(event as any, {
      rewards: {
        items: [{ item: {}, amount: 2, chance: 100 }],
        showNotification: true,
      },
    });

    ai.handleDamage(attacker as any, { damage: 10, defeated: true });

    expect(attacker.showNotification).toHaveBeenCalledWith(
      {
        key: ACTION_BATTLE_I18N_KEYS.rewardItem,
        count: 2,
        params: { count: 2 },
      },
      { icon: undefined }
    );
  });

  test("round-trips an AI reward into a fully localized client message", () => {
    const event = createEvent();
    const attacker = createPlayer();
    const ai = new BattleAi(event as any, {
      rewards: {
        items: [
          {
            itemId: "potion",
            itemNameKey: "game.item.potion",
            amount: 2,
            chance: 100,
          },
        ],
        showNotification: true,
      },
    });

    ai.handleDamage(attacker as any, { damage: 10, defeated: true });
    const wireMessage = JSON.parse(
      JSON.stringify(attacker.showNotification.mock.calls[0][0])
    );
    const service = new I18nService({
      defaultLocale: "es",
      fallbackLocale: "en",
      messages: {
        es: {
          [ACTION_BATTLE_I18N_KEYS.rewardNamedItemOne]:
            "Ganaste {count} {item}",
          [ACTION_BATTLE_I18N_KEYS.rewardNamedItemOther]:
            "Ganaste {count} unidades de {item}",
          "game.item.potion": "Poción",
        },
      },
    });

    expect(service.translateDescriptor(wireMessage, "es")).toBe(
      "Ganaste 2 unidades de Poción"
    );
  });

  test("supports the context onDefeated callback and manual reward control", () => {
    const event = createEvent();
    const attacker = createPlayer();
    const onDefeated = vi.fn(({ reward }) => {
      expect(reward.awarded).toBe(false);
      reward.giveTo(attacker as any);
      expect(reward.awarded).toBe(true);
    });
    const ai = new BattleAi(event as any, {
      autoAwardRewards: false,
      rewards: {
        exp: 10,
      },
      onDefeated,
    });

    ai.handleDamage(attacker as any, { damage: 10, defeated: true });

    expect(onDefeated).toHaveBeenCalledWith(
      expect.objectContaining({
        event,
        attacker,
        reward: expect.any(Object),
        remove: expect.any(Function),
      })
    );
    expect(attacker.exp).toBe(10);
    expect(event.remove).toHaveBeenCalledWith({
      reason: "defeated",
      data: {
        animation: null,
        deathPresentation: {
          effect: "explosionSmall",
          durationMs: 450,
          scale: 1.4,
          shake: true,
        },
      },
      transition: {
        animation: undefined,
        graphic: undefined,
        effect: "explosionSmall",
        duration: 450,
      },
      timeoutMs: 450,
    });
  });

  test("can disable the fallback death presentation", () => {
    const event = createEvent();
    const ai = new BattleAi(event as any, {
      presentation: { death: false },
    });

    ai.handleDamage(createPlayer() as any, { damage: 10, defeated: true });

    expect(event.remove).toHaveBeenCalledWith({
      reason: "defeated",
      data: {
        animation: null,
        deathPresentation: false,
      },
      transition: undefined,
      timeoutMs: 0,
    });
  });
});

describe("BattleAi vision setup", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setActionBattleSystems({});
  });

  test("retries vision attachment when the physics body is not ready yet", () => {
    vi.useFakeTimers();
    const event = createEvent();
    const visionShape = { id: "vision_monster-1" };
    event.attachShape.mockReturnValueOnce(undefined).mockReturnValueOnce(visionShape);

    const ai = new BattleAi(event as any);

    expect(event.attachShape).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60);

    expect(event.attachShape).toHaveBeenCalledTimes(2);
    expect(event.attachShape).toHaveBeenLastCalledWith("vision_monster-1", {
      radius: 150,
      width: 300,
      height: 300,
      angle: 360,
    });

    ai.destroy();
  });
});

describe("BattleAi behavior tree", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    setActionBattleSystems({});
  });

  test("executes simplified behavior intents", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      simpleBehavior: {
        when: [ifTargetVisible(chase())],
      },
    });

    ai.onDetectInShape(player as any, {});
    vi.advanceTimersByTime(100);

    expect(event.moveTo).toHaveBeenCalledWith(player);
    ai.destroy();
  });

  test("retries a phase attack after range rejection and executes it once", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.hp = 4;
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 100),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackCooldown: 0,
      attackRange: 50,
      behaviorTree: phase("range", 0.5, {
        ...useAttack(AttackPattern.Melee),
        consume: false,
      }),
    });
    const performAttack = vi
      .spyOn(ai as any, "performAttackPattern")
      .mockImplementation(() => undefined);
    ai.onDetectInShape(player as any, {});

    expect((ai as any).applyCustomBehavior(1000)).toBe(false);
    expect(performAttack).not.toHaveBeenCalled();
    expect(getActionBattleAiPendingExecutionCountForTests(ai)).toBe(0);

    player.x.mockReturnValue(20);
    expect((ai as any).applyCustomBehavior(1100)).toBe(false);
    expect(performAttack).toHaveBeenCalledOnce();

    expect((ai as any).applyCustomBehavior(1200)).toBe(false);
    expect(performAttack).toHaveBeenCalledOnce();
    ai.destroy();
  });

  test("retries a phase skill after cooldown rejection and executes it once", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.hp = 4;
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const skill = {
      id: "phase-skill",
      spCost: 0,
      action: {
        mode: "melee",
        target: "enemy",
        cooldownMs: 500,
      },
      onUse: vi.fn(),
    };
    const ai = new BattleAi(event as any, {
      attackCooldown: 0,
      attackRange: 50,
      behaviorTree: phase("skill", 0.5, useSkill(skill)),
    });
    const performSkill = vi
      .spyOn(ai as any, "performPlannedSkill")
      .mockReturnValue(true);
    (ai as any).skillCooldowns.set(skill.id, 1000);
    ai.onDetectInShape(player as any, {});

    expect((ai as any).applyCustomBehavior(900)).toBe(false);
    expect(performSkill).not.toHaveBeenCalled();
    expect(getActionBattleAiPendingExecutionCountForTests(ai)).toBe(0);

    expect((ai as any).applyCustomBehavior(1000)).toBe(true);
    expect(performSkill).toHaveBeenCalledOnce();

    expect((ai as any).applyCustomBehavior(1100)).toBe(false);
    expect(performSkill).toHaveBeenCalledOnce();
    ai.destroy();
  });

  test("retries only the cooldown-rejected tail of a combat intent array", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const skill = {
      id: "combo-finisher",
      spCost: 0,
      action: { mode: "melee", target: "enemy" },
      onUse: vi.fn(),
    };
    const ai = new BattleAi(event as any, {
      attackCooldown: 100,
      attackRange: 50,
      behaviorTree: once("combo", [
        useAttack(AttackPattern.Melee),
        useSkill(skill),
      ]),
    });
    const performAttack = vi
      .spyOn(ai as any, "performAttackPattern")
      .mockImplementation(() => undefined);
    const performSkill = vi
      .spyOn(ai as any, "performPlannedSkill")
      .mockReturnValue(true);
    ai.onDetectInShape(player as any, {});

    expect((ai as any).applyCustomBehavior(1000)).toBe(true);
    expect(performAttack).toHaveBeenCalledOnce();
    expect(performSkill).not.toHaveBeenCalled();
    expect(getActionBattleAiPendingExecutionCountForTests(ai)).toBe(0);

    expect((ai as any).applyCustomBehavior(1100)).toBe(true);
    expect(performAttack).toHaveBeenCalledOnce();
    expect(performSkill).toHaveBeenCalledOnce();

    expect((ai as any).applyCustomBehavior(1200)).toBe(false);
    expect(performAttack).toHaveBeenCalledOnce();
    expect(performSkill).toHaveBeenCalledOnce();
    ai.destroy();
  });

  test("rejects AI attack intents while defeated and resumes after revival", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.hp = 0;
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackCooldown: 0,
      attackRange: 50,
      behaviorTree: once("defeated-ai", useAttack(AttackPattern.Melee)),
    });
    const performAttack = vi
      .spyOn(ai as any, "performAttackPattern")
      .mockImplementation(() => undefined);
    ai.onDetectInShape(player as any, {});

    expect((ai as any).applyCustomBehavior(1000)).toBe(false);
    expect(performAttack).not.toHaveBeenCalled();

    event.hp = 10;
    expect((ai as any).applyCustomBehavior(1001)).toBe(true);
    expect(performAttack).toHaveBeenCalledOnce();
    ai.destroy();
  });

  test("invalidates startup, combo, and dash across transient defeat and permits new revival work", () => {
    vi.useFakeTimers();
    const event = {
      ...createEvent(),
      dash: vi.fn(),
    };
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackRange: 50,
      attackPatterns: [AttackPattern.Combo, AttackPattern.DashAttack],
    });
    clearInterval((ai as any).updateInterval);
    (ai as any).updateInterval = undefined;
    ai.onDetectInShape(player as any, {});
    ai.onDetectInShape(player as any, {});
    const executeMeleeAttack = vi.spyOn(ai as any, "executeMeleeAttack");
    const genericStartup = vi.fn();

    (ai as any).scheduleAttackStartup(
      (ai as any).getAttackProfile(AttackPattern.Melee),
      genericStartup,
    );
    (ai as any).performComboAttack();
    (ai as any).performDashAttack();
    event.hp = 0;
    event.hp = 10;
    vi.advanceTimersByTime(2_000);

    expect(genericStartup).not.toHaveBeenCalled();
    expect(executeMeleeAttack).not.toHaveBeenCalled();
    expect(event.dash).not.toHaveBeenCalled();
    expect((ai as any).comboCount).toBe(0);

    ai.onDetectInShape(player as any, {});
    ai.onDetectInShape(player as any, {});
    (ai as any).state = AiState.Combat;
    (ai as any).scheduleAttackStartup(
      (ai as any).getAttackProfile(AttackPattern.Melee),
      genericStartup,
    );
    (ai as any).performDashAttack();
    vi.advanceTimersByTime(2_000);

    expect(genericStartup).toHaveBeenCalledOnce();
    expect(event.dash).toHaveBeenCalledOnce();
    expect(executeMeleeAttack).toHaveBeenCalled();
    ai.destroy();
  });

  test("invalidates active frames, charge completion, and defensive counters across lives", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const event = {
      ...createEvent(),
      dash: vi.fn(),
    };
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      enemyType: EnemyType.Defensive,
      dodgeChance: 1,
      attackRange: 50,
    });
    clearInterval((ai as any).updateInterval);
    (ai as any).updateInterval = undefined;
    ai.onDetectInShape(player as any, {});
    (ai as any).state = AiState.Combat;

    const processHitboxHits = vi.spyOn(ai as any, "processHitboxHits");
    (ai as any).performZoneAttack();
    vi.advanceTimersByTime(450);
    expect(processHitboxHits).toHaveBeenCalledOnce();
    processHitboxHits.mockClear();
    event.hp = 0;
    event.hp = 10;
    vi.advanceTimersByTime(500);
    expect(processHitboxHits).not.toHaveBeenCalled();

    const executeMeleeAttack = vi.spyOn(ai as any, "executeMeleeAttack");
    (ai as any).performChargedAttack();
    event.hp = 0;
    event.hp = 10;
    vi.advanceTimersByTime(2_000);
    expect(executeMeleeAttack).not.toHaveBeenCalled();
    expect((ai as any).chargingAttack).toBe(false);

    const selectAndPerformAttack = vi.spyOn(ai as any, "selectAndPerformAttack");
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect((ai as any).tryDodge()).toBe(true);
    event.hp = 0;
    event.hp = 10;
    vi.advanceTimersByTime(500);
    expect(selectAndPerformAttack).not.toHaveBeenCalled();
    ai.destroy();
  });

  test("invalidates every delayed attack phase across a transient AI state interruption", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const event = {
      ...createEvent(),
      dash: vi.fn(),
    };
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      enemyType: EnemyType.Defensive,
      dodgeChance: 1,
      attackRange: 50,
    });
    clearInterval((ai as any).updateInterval);
    (ai as any).updateInterval = undefined;
    ai.onDetectInShape(player as any, {});
    ai.onDetectInShape(player as any, {});
    expect(ai.getState()).toBe(AiState.Combat);

    const leaveState = (state: AiState) => {
      (ai as any).changeState(state);
      expect(ai.getState()).toBe(state);
    };
    const recover = () => {
      (ai as any).changeState(AiState.Combat);
      expect(ai.getState()).toBe(AiState.Combat);
    };
    const interruptAndRecover = () => {
      leaveState(AiState.Stunned);
      recover();
    };
    const executeMeleeAttack = vi.spyOn(ai as any, "executeMeleeAttack");

    (ai as any).performMeleeAttack();
    interruptAndRecover();
    vi.advanceTimersByTime(500);
    expect(executeMeleeAttack).not.toHaveBeenCalled();

    (ai as any).performChargedAttack();
    leaveState(AiState.Stunned);
    vi.advanceTimersByTime(2_000);
    expect(executeMeleeAttack).not.toHaveBeenCalled();
    expect((ai as any).chargingAttack).toBe(false);
    recover();

    const performComboAttack = vi.spyOn(ai as any, "performComboAttack");
    (ai as any).performComboAttack();
    leaveState(AiState.Flee);
    vi.advanceTimersByTime(500);
    expect(performComboAttack).toHaveBeenCalledOnce();
    expect((ai as any).comboCount).toBe(0);
    expect(executeMeleeAttack).not.toHaveBeenCalled();
    recover();

    event.dash.mockClear();
    (ai as any).performDashAttack();
    leaveState(AiState.Idle);
    vi.advanceTimersByTime(500);
    expect(event.dash).not.toHaveBeenCalled();
    expect(executeMeleeAttack).not.toHaveBeenCalled();
    recover();

    const dashProfile = (ai as any).getAttackProfile(
      AttackPattern.DashAttack,
    );
    (ai as any).performDashAttack();
    vi.advanceTimersByTime(dashProfile.startupMs);
    expect(event.dash).toHaveBeenCalledOnce();
    executeMeleeAttack.mockClear();
    leaveState(AiState.Stunned);
    vi.advanceTimersByTime(250);
    expect(executeMeleeAttack).not.toHaveBeenCalled();
    recover();

    const processHitboxHits = vi.spyOn(ai as any, "processHitboxHits");
    (ai as any).performZoneAttack();
    interruptAndRecover();
    vi.advanceTimersByTime(1_000);
    expect(processHitboxHits).not.toHaveBeenCalled();

    const selectAndPerformAttack = vi.spyOn(ai as any, "selectAndPerformAttack");
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect((ai as any).tryDodge()).toBe(true);
    leaveState(AiState.Flee);
    vi.advanceTimersByTime(500);
    expect(selectAndPerformAttack).not.toHaveBeenCalled();
    ai.destroy();
  });

  test.each([
    { label: "Stunned", states: [AiState.Stunned] },
    { label: "Flee", states: [AiState.Flee] },
    { label: "Idle", states: [AiState.Idle] },
    {
      label: "Idle and immediately back to Combat",
      states: [AiState.Idle, AiState.Combat],
    },
  ])(
    "cancels an actor-centered Zone after Combat changes to $label",
    ({ states }) => {
      vi.useFakeTimers();
      const event = createEvent();
      event.attachShape.mockReturnValue({ id: "vision_monster-1" });
      const player = {
        ...createPlayer(),
        hp: 10,
        x: vi.fn(() => 20),
        y: vi.fn(() => 0),
      };
      const ai = new BattleAi(event as any, { attackRange: 50 });
      clearInterval((ai as any).updateInterval);
      (ai as any).updateInterval = undefined;
      ai.onDetectInShape(player as any, {});
      ai.onDetectInShape(player as any, {});
      const processHitboxHits = vi.spyOn(ai as any, "processHitboxHits");

      (ai as any).performZoneAttack();
      for (const state of states) (ai as any).changeState(state);
      vi.advanceTimersByTime(1_000);

      expect(processHitboxHits).not.toHaveBeenCalled();
      ai.destroy();
    },
  );

  test("centers every Zone active frame on the actor's current coordinates", () => {
    vi.useFakeTimers();
    let eventX = 0;
    let eventY = 0;
    const event = createEvent();
    event.x.mockImplementation(() => eventX);
    event.y.mockImplementation(() => eventY);
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, { attackRange: 50 });
    clearInterval((ai as any).updateInterval);
    (ai as any).updateInterval = undefined;
    ai.onDetectInShape(player as any, {});
    ai.onDetectInShape(player as any, {});
    const processHitboxHits = vi.spyOn(ai as any, "processHitboxHits");

    (ai as any).performZoneAttack();
    eventX = 100;
    eventY = 200;
    vi.advanceTimersByTime(450);

    const firstFrame = processHitboxHits.mock.calls[0][0];
    expect(firstFrame[0]).toMatchObject({ x: 150, y: 200 });
    expect(firstFrame[1].x).toBeCloseTo(100);
    expect(firstFrame[1].y).toBeCloseTo(250);
    expect(firstFrame[2]).toMatchObject({ x: 50, y: 200 });
    expect(firstFrame[3].x).toBeCloseTo(100);
    expect(firstFrame[3].y).toBeCloseTo(150);

    eventX = 300;
    eventY = 400;
    vi.advanceTimersByTime(16);

    const secondFrame = processHitboxHits.mock.calls[1][0];
    expect(secondFrame[0]).toMatchObject({ x: 350, y: 400 });
    expect(secondFrame[1].x).toBeCloseTo(300);
    expect(secondFrame[1].y).toBeCloseTo(450);
    expect(secondFrame[2]).toMatchObject({ x: 250, y: 400 });
    expect(secondFrame[3].x).toBeCloseTo(300);
    expect(secondFrame[3].y).toBeCloseTo(350);
    ai.destroy();
  });

  test("binds every delayed attack pattern to the original target life", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const event = {
      ...createEvent(),
      dash: vi.fn(),
    };
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      enemyType: EnemyType.Defensive,
      dodgeChance: 1,
      attackRange: 50,
    });
    clearInterval((ai as any).updateInterval);
    (ai as any).updateInterval = undefined;
    ai.onDetectInShape(player as any, {});
    ai.onDetectInShape(player as any, {});
    (ai as any).state = AiState.Combat;

    const processHitboxHits = vi.spyOn(ai as any, "processHitboxHits");
    const executeMeleeAttack = vi.spyOn(ai as any, "executeMeleeAttack");
    const selectAndPerformAttack = vi.spyOn(ai as any, "selectAndPerformAttack");

    // Let the first zone frame commit, then leave later active frames pending.
    (ai as any).performZoneAttack();
    vi.advanceTimersByTime(450);
    expect(processHitboxHits).toHaveBeenCalledOnce();
    processHitboxHits.mockClear();

    (ai as any).performMeleeAttack();
    (ai as any).performComboAttack();
    (ai as any).performChargedAttack();
    (ai as any).performDashAttack();
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect((ai as any).tryDodge()).toBe(true);
    const committedDodgeDashes = event.dash.mock.calls.length;

    player.hp = 0;
    player.hp = 10;
    vi.advanceTimersByTime(2_000);

    // Zone does not bind one selected target and may resolve around the actor.
    expect(processHitboxHits).toHaveBeenCalled();
    expect(executeMeleeAttack).not.toHaveBeenCalled();
    expect(event.dash).toHaveBeenCalledTimes(committedDodgeDashes);
    expect(selectAndPerformAttack).not.toHaveBeenCalled();
    expect((ai as any).comboCount).toBe(0);
    expect((ai as any).chargingAttack).toBe(false);

    // Replanning after revival captures the new life and executes normally.
    (ai as any).performMeleeAttack();
    (ai as any).performDashAttack();
    vi.advanceTimersByTime(2_000);

    expect(executeMeleeAttack).toHaveBeenCalled();
    expect(event.dash.mock.calls.length).toBeGreaterThan(committedDodgeDashes);
    ai.destroy();
  });

  test("does not redirect pending delayed patterns when the target is replaced", () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    const event = {
      ...createEvent(),
      dash: vi.fn(),
    };
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const original = {
      ...createPlayer(),
      id: "original-target",
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const replacement = {
      ...createPlayer(),
      id: "replacement-target",
      hp: 10,
      x: vi.fn(() => -20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      enemyType: EnemyType.Defensive,
      dodgeChance: 1,
      attackRange: 50,
    });
    clearInterval((ai as any).updateInterval);
    (ai as any).updateInterval = undefined;
    ai.onDetectInShape(original as any, {});
    ai.onDetectInShape(original as any, {});
    (ai as any).state = AiState.Combat;

    const processHitboxHits = vi.spyOn(ai as any, "processHitboxHits");
    const executeMeleeAttack = vi.spyOn(ai as any, "executeMeleeAttack");
    const selectAndPerformAttack = vi.spyOn(ai as any, "selectAndPerformAttack");

    (ai as any).performMeleeAttack();
    (ai as any).performComboAttack();
    (ai as any).performChargedAttack();
    (ai as any).performZoneAttack();
    (ai as any).performDashAttack();
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect((ai as any).tryDodge()).toBe(true);
    const committedDodgeDashes = event.dash.mock.calls.length;

    (ai as any).target = replacement;
    vi.advanceTimersByTime(2_000);

    // Zone does not bind one selected target and may resolve around the actor.
    expect(processHitboxHits).toHaveBeenCalled();
    expect(executeMeleeAttack).not.toHaveBeenCalled();
    expect(event.dash).toHaveBeenCalledTimes(committedDodgeDashes);
    expect(selectAndPerformAttack).not.toHaveBeenCalled();
    expect((ai as any).comboCount).toBe(0);
    expect((ai as any).chargingAttack).toBe(false);

    // A fresh attack telegraphed against the replacement remains valid.
    (ai as any).performChargedAttack();
    vi.advanceTimersByTime(2_000);

    expect(executeMeleeAttack).toHaveBeenCalledOnce();
    ai.destroy();
  });

  test("destroy abandons an executor-scoped rejected receipt", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackCooldown: 0,
      attackRange: 50,
      behaviorTree: once("destroyed", useAttack(AttackPattern.Melee)),
    });
    vi.spyOn(ai as any, "executeRequestedAttack").mockImplementation(() => {
      expect(getActionBattleAiPendingExecutionCountForTests(ai)).toBe(1);
      ai.destroy();
      return false;
    });
    ai.onDetectInShape(player as any, {});

    expect((ai as any).applyCustomBehavior(1000)).toBe(false);
    expect(getActionBattleAiPendingExecutionCountForTests(ai)).toBe(0);
    expect(getActionBattleAiPendingExecutionCountForTests()).toBe(0);
  });

  test("isolates one-shot receipts across BattleAi instances sharing an authored intent", () => {
    vi.useFakeTimers();
    const firstEvent = createEvent();
    const secondEvent = createEvent();
    secondEvent.id = "monster-2";
    firstEvent.attachShape.mockReturnValue({ id: "vision_monster-1" });
    secondEvent.attachShape.mockReturnValue({ id: "vision_monster-2" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const sharedTree = once(
      "shared-instance",
      useAttack(AttackPattern.Melee)
    );
    const firstAi = new BattleAi(firstEvent as any, {
      attackCooldown: 0,
      attackRange: 50,
      behaviorTree: sharedTree,
    });
    const secondAi = new BattleAi(secondEvent as any, {
      attackCooldown: 0,
      attackRange: 50,
      behaviorTree: sharedTree,
    });
    const firstAttack = vi
      .spyOn(firstAi as any, "performAttackPattern")
      .mockImplementation(() => undefined);
    const secondAttack = vi
      .spyOn(secondAi as any, "performAttackPattern")
      .mockImplementation(() => undefined);
    firstAi.onDetectInShape(player as any, {});
    secondAi.onDetectInShape(player as any, {});

    expect((firstAi as any).applyCustomBehavior(1000)).toBe(true);
    expect((secondAi as any).applyCustomBehavior(1000)).toBe(true);
    expect(firstAttack).toHaveBeenCalledOnce();
    expect(secondAttack).toHaveBeenCalledOnce();

    expect((firstAi as any).applyCustomBehavior(1100)).toBe(false);
    expect((secondAi as any).applyCustomBehavior(1100)).toBe(false);
    expect(firstAttack).toHaveBeenCalledOnce();
    expect(secondAttack).toHaveBeenCalledOnce();
    firstAi.destroy();
    secondAi.destroy();
  });

  test("composes named AI presets with local overrides", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    setActionBattleSystems({
      ai: {
        presets: {
          slime: {
            preset: "aggressive",
            visionRange: 220,
            simpleBehavior: {
              otherwise: chase(),
            },
          },
        },
      },
    });

    const ai = new BattleAi(event as any, {
      preset: "slime",
      attackRange: 70,
    });

    expect(event.attachShape).toHaveBeenCalledWith("vision_monster-1", {
      radius: 220,
      width: 440,
      height: 440,
      angle: 360,
    });
    ai.destroy();
  });

  test("local behavior tree overrides preset simple behavior", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    setActionBattleSystems({
      ai: {
        presets: {
          ranged: {
            simpleBehavior: {
              otherwise: chase(),
            },
          },
        },
      },
    });

    const ai = new BattleAi(event as any, {
      preset: "ranged",
      behaviorTree: () => ({ status: "success", intent: idle() }),
    });

    ai.onDetectInShape(player as any, {});
    vi.advanceTimersByTime(100);

    expect(event.moveTo).not.toHaveBeenCalled();
    expect(event.stopMoveTo).toHaveBeenCalled();
    ai.destroy();
  });

  test("does not target an already defeated player", () => {
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const ai = new BattleAi(event as any);
    const player = {
      ...createPlayer(),
      hp: 0,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };

    ai.onDetectInShape(player as any, {});

    expect(ai.getTarget()).toBeNull();
    ai.destroy();
  });

  test("approaches a visible target while alert but not yet in combat range", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 120),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackRange: 50,
      visionRange: 150,
    });

    ai.onDetectInShape(player as any, {});
    vi.advanceTimersByTime(100);

    expect(event.moveTo).toHaveBeenCalledWith(player);
    ai.destroy();
  });

  test("normalizes position move targets before calling RPGJS moveTo", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });

    const ai = new BattleAi(event as any, {
      patrolWaypoints: [{ x: 32, y: 48 }],
      moveToCooldown: 0,
    });

    expect(event.moveTo).toHaveBeenCalledWith({ x: 32, y: 48 });
    ai.destroy();
  });

  test("targets its attacker after taking non-lethal damage", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.hp = 9;
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 120),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackRange: 50,
      visionRange: 150,
    });

    ai.handleDamage(player as any, { damage: 1, defeated: false });

    expect(ai.getTarget()).toBe(player);
    ai.destroy();
  });

  test("waits for damage recovery before chasing its attacker", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const event = createEvent();
    event.hp = 9;
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 120),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackRange: 50,
      visionRange: 150,
      hitstunMs: 100,
      moveToCooldown: 0,
    });

    ai.handleDamage(player as any, { damage: 1, defeated: false });
    vi.advanceTimersByTime(200);
    expect(event.moveTo).not.toHaveBeenCalledWith(player);

    vi.advanceTimersByTime(100);
    expect(event.moveTo).toHaveBeenCalledWith(player);
    ai.destroy();
  });

  test("chases its attacker after hitstun ends", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const event = createEvent();
    event.hp = 9;
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 120),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackRange: 50,
      visionRange: 150,
      hitstunMs: 100,
      moveToCooldown: 0,
    });

    ai.handleDamage(player as any, { damage: 1, defeated: false });
    vi.advanceTimersByTime(300);

    expect(event.moveTo).toHaveBeenCalledWith(player);
    ai.destroy();
  });

  test("behavior tree idle fallback does not block target acquisition", () => {
    vi.useFakeTimers();
    const event = createEvent();
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 30),
      y: vi.fn(() => 0),
    };
    const map = {
      getPlayers: vi.fn(() => [player]),
      getEvents: vi.fn(() => [event]),
    };
    event.getCurrentMap.mockReturnValue(map);
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });

    const ai = new BattleAi(event as any, {
      simpleBehavior: {
        otherwise: idle(),
      },
    });

    vi.advanceTimersByTime(100);

    expect(ai.getTarget()).toBe(player);
    ai.destroy();
  });

  test("clears its target when the player is defeated", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any);

    ai.onDetectInShape(player as any, {});
    expect(ai.getTarget()).toBe(player);

    player.hp = 0;
    vi.advanceTimersByTime(100);

    expect(ai.getTarget()).toBeNull();
    expect(event.stopMoveTo).toHaveBeenCalled();
    ai.destroy();
  });

  test("can target hostile BattleAi events by faction", () => {
    vi.useFakeTimers();
    const event = createEvent();
    const hostile = {
      ...createEvent(),
      id: "bandit-1",
      hp: 10,
      x: vi.fn(() => 30),
      y: vi.fn(() => 0),
      battleAi: {
        getFaction: () => "bandits",
        getTargets: () => "players",
      },
    };
    const map = {
      getPlayers: vi.fn(() => []),
      getEvents: vi.fn(() => [event, hostile]),
    };
    event.getCurrentMap.mockReturnValue(map);
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });

    const ai = new BattleAi(event as any, {
      faction: "guards",
      targets: ["bandits"],
    });

    vi.advanceTimersByTime(100);

    expect(ai.getTarget()).toBe(hostile);
    ai.destroy();
  });

  test("dash attacks emit an attack visual before the dash hit", () => {
    vi.useFakeTimers();
    const clientVisual = vi.fn();
    const event = createEvent();
    event.getCurrentMap.mockReturnValue({ clientVisual });
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackPatterns: [AttackPattern.DashAttack],
      attackRange: 50,
      moveToCooldown: 0,
    });

    ai.onDetectInShape(player as any, {});
    (ai as any).performDashAttack();

    expect(clientVisual).toHaveBeenCalledWith(
      ACTION_BATTLE_CLIENT_VISUAL_ID,
      expect.objectContaining({
        moment: "attack",
        objectId: "monster-1",
        targetId: "player-1",
        pattern: AttackPattern.DashAttack,
      })
    );
    ai.destroy();
  });

  test("selects distance-appropriate special attacks without repetition", () => {
    const event = createEvent();
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackRange: 100,
      attackPatterns: [
        AttackPattern.Zone,
        AttackPattern.DashAttack,
        AttackPattern.Melee,
      ],
    });
    ai.onDetectInShape(player as any, {});

    expect((ai as any).selectAttackCandidates(20)).toEqual([
      AttackPattern.Zone,
      AttackPattern.Melee,
    ]);
    (ai as any).lastAttackPattern = AttackPattern.Zone;
    expect((ai as any).selectAttackCandidates(20)).toEqual([
      AttackPattern.Melee,
    ]);
    expect((ai as any).selectAttackCandidates(90)).toEqual([
      AttackPattern.DashAttack,
      AttackPattern.Melee,
    ]);
    ai.destroy();
  });

  test("falls back to a basic attack while the preferred skill cools down", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const event = createEvent();
    const onUse = vi.fn();
    const skill = {
      id: "fire",
      spCost: 0,
      action: { cooldownMs: 800 },
      onUse,
    };
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackSkill: skill,
      attackRange: 50,
    });
    ai.onDetectInShape(player as any, {});
    const firstEvaluations = (ai as any).evaluateSkillActions(1000);
    const firstAction = (ai as any).selectCombatAction(firstEvaluations, 20);
    expect(firstAction).toMatchObject({
      kind: "skill",
      evaluation: { id: "fire" },
    });

    expect((ai as any).performPlannedSkill(firstAction.evaluation)).toBe(true);
    vi.advanceTimersByTime(500);
    expect(onUse).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1600);
    const cooldownEvaluations = (ai as any).evaluateSkillActions(1600);
    expect(cooldownEvaluations[0].rejection).toBe("cooldown");
    expect((ai as any).selectCombatAction(cooldownEvaluations, 20)).toEqual({
      kind: "basic",
    });
    ai.destroy();
  });

  test("rejects AI skills before facing, locks, visuals, costs, hooks, or fallback", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const clientVisual = vi.fn();
    const event = {
      ...createEvent(),
      hp: 10,
      sp: 12,
      hasEffect: vi.fn((effect: string) => effect === "CAN_NOT_SKILL"),
      getCurrentMap: vi.fn(() => ({
        tileWidth: 32,
        tileHeight: 32,
        getPlayers: () => [],
        getEvents: () => [],
        clientVisual,
      })),
    };
    const onUse = vi.fn();
    const skill = {
      id: "sealed-bolt",
      spCost: 4,
      targeting: { range: 3 },
      action: { mode: "projectile", target: "enemy" },
      onUse,
    };
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackSkill: skill,
      attackRange: 50,
    });
    ai.onDetectInShape(player as any, {});
    const evaluation = (ai as any).evaluateSkillActions(1000)[0];
    const faceTarget = vi.spyOn(ai as any, "faceTarget");
    const lockForAttack = vi.spyOn(ai as any, "lockForAttack");
    const telegraphAttack = vi.spyOn(ai as any, "telegraphAttack");
    const playAttackVisual = vi.spyOn(ai as any, "playAttackVisual");
    const scheduleAttackStartup = vi.spyOn(ai as any, "scheduleAttackStartup");
    const performBasicHitbox = vi.spyOn(ai as any, "performBasicHitbox");
    event.changeDirection.mockClear();
    event.stopMoveTo.mockClear();
    event.flash.mockClear();
    clientVisual.mockClear();
    const timerCount = vi.getTimerCount();

    expect((ai as any).performPlannedSkill(evaluation)).toBe(false);
    expect(faceTarget).not.toHaveBeenCalled();
    expect(lockForAttack).not.toHaveBeenCalled();
    expect(telegraphAttack).not.toHaveBeenCalled();
    expect(playAttackVisual).not.toHaveBeenCalled();
    expect(scheduleAttackStartup).not.toHaveBeenCalled();
    expect(performBasicHitbox).not.toHaveBeenCalled();
    expect(event.changeDirection).not.toHaveBeenCalled();
    expect(event.stopMoveTo).not.toHaveBeenCalled();
    expect(event.flash).not.toHaveBeenCalled();
    expect(clientVisual).not.toHaveBeenCalled();
    expect(onUse).not.toHaveBeenCalled();
    expect(event.sp).toBe(12);
    expect(vi.getTimerCount()).toBe(timerCount);
    ai.destroy();
  });

  test("rechecks AI skill restrictions at startup without a basic-hit fallback", () => {
    const event = {
      ...createEvent(),
      hp: 10,
      sp: 12,
    };
    let restricted = false;
    (event as any).hasEffect = vi.fn(
      (effect: string) => effect === "CAN_NOT_SKILL" && restricted,
    );
    const onUse = vi.fn();
    const skill = {
      id: "interruptible-bolt",
      spCost: 4,
      targeting: { range: 3 },
      action: { mode: "projectile", target: "enemy" },
      onUse,
    };
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackSkill: skill,
      attackRange: 50,
    });
    ai.onDetectInShape(player as any, {});
    const evaluation = (ai as any).evaluateSkillActions(1000)[0];
    let startup: (() => void) | undefined;
    vi.spyOn(ai as any, "scheduleAttackStartup").mockImplementation(
      (_profile: unknown, callback: () => void) => {
        startup = callback;
      },
    );
    const performBasicHitbox = vi.spyOn(ai as any, "performBasicHitbox");

    expect((ai as any).performPlannedSkill(evaluation)).toBe(true);
    restricted = true;
    startup?.();
    expect(onUse).not.toHaveBeenCalled();
    expect(event.sp).toBe(12);
    expect(performBasicHitbox).not.toHaveBeenCalled();

    restricted = false;
    startup?.();
    expect(onUse).toHaveBeenCalledOnce();
    expect(event.sp).toBe(8);
    expect(performBasicHitbox).not.toHaveBeenCalled();
    ai.destroy();
  });

  test("cancels a planned skill when its captured target is defeated during startup", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const event = {
      ...createEvent(),
      sp: 12,
    };
    const onUse = vi.fn();
    const skill = {
      id: "delayed-strike",
      spCost: 4,
      action: {
        mode: "instant" as const,
        target: "enemy" as const,
        range: 50,
        cooldownMs: 800,
      },
      onUse,
    };
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackSkill: skill,
      attackRange: 50,
    });
    clearInterval((ai as any).updateInterval);
    (ai as any).updateInterval = undefined;
    ai.onDetectInShape(player as any, {});
    const evaluation = (ai as any).evaluateSkillActions(1_000)[0];

    expect((ai as any).performPlannedSkill(evaluation)).toBe(true);
    player.hp = 0;
    vi.advanceTimersByTime(500);

    expect(onUse).not.toHaveBeenCalled();
    expect(event.sp).toBe(12);
    expect((ai as any).skillCooldowns.size).toBe(0);

    player.hp = 10;
    vi.setSystemTime(2_000);
    const revivedEvaluation = (ai as any).evaluateSkillActions(2_000)[0];
    expect((ai as any).performPlannedSkill(revivedEvaluation)).toBe(true);
    vi.advanceTimersByTime(500);
    expect(onUse).toHaveBeenCalledOnce();
    expect(event.sp).toBe(8);
    expect((ai as any).skillCooldowns.size).toBe(1);
    ai.destroy();
  });

  test("cancels a planned skill when its captured target dies and revives during startup", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const event = { ...createEvent(), sp: 12 };
    const onUse = vi.fn();
    const skill = {
      id: "life-bound-strike",
      spCost: 4,
      action: {
        mode: "instant" as const,
        target: "enemy" as const,
        range: 50,
        cooldownMs: 800,
      },
      onUse,
    };
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackSkill: skill,
      attackRange: 50,
    });
    clearInterval((ai as any).updateInterval);
    (ai as any).updateInterval = undefined;
    ai.onDetectInShape(player as any, {});

    const staleEvaluation = (ai as any).evaluateSkillActions(1_000)[0];
    expect((ai as any).performPlannedSkill(staleEvaluation)).toBe(true);
    player.hp = 0;
    player.hp = 10;
    vi.advanceTimersByTime(500);

    expect(onUse).not.toHaveBeenCalled();
    expect(event.sp).toBe(12);
    expect((ai as any).skillCooldowns.size).toBe(0);

    vi.setSystemTime(2_000);
    const revivedEvaluation = (ai as any).evaluateSkillActions(2_000)[0];
    expect((ai as any).performPlannedSkill(revivedEvaluation)).toBe(true);
    vi.advanceTimersByTime(500);

    expect(onUse).toHaveBeenCalledOnce();
    expect(event.sp).toBe(8);
    expect((ai as any).skillCooldowns.size).toBe(1);
    ai.destroy();
  });

  test("revalidates planned target identity and range before skill hooks or spend", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const event = { ...createEvent(), sp: 12 };
    const onUse = vi.fn();
    const skill = {
      id: "measured-strike",
      spCost: 4,
      action: {
        mode: "instant" as const,
        target: "enemy" as const,
        range: 50,
      },
      onUse,
    };
    const first = {
      ...createPlayer(),
      id: "first-target",
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const second = {
      ...createPlayer(),
      id: "second-target",
      hp: 10,
      x: vi.fn(() => 20),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackSkill: skill,
      attackRange: 50,
    });
    clearInterval((ai as any).updateInterval);
    (ai as any).updateInterval = undefined;
    ai.onDetectInShape(first as any, {});

    const identityPlan = (ai as any).evaluateSkillActions(1_000)[0];
    expect((ai as any).performPlannedSkill(identityPlan)).toBe(true);
    (ai as any).target = second;
    vi.advanceTimersByTime(500);
    expect(onUse).not.toHaveBeenCalled();
    expect(event.sp).toBe(12);

    (ai as any).target = first;
    vi.setSystemTime(2_000);
    const rangePlan = (ai as any).evaluateSkillActions(2_000)[0];
    expect((ai as any).performPlannedSkill(rangePlan)).toBe(true);
    first.x.mockReturnValue(200);
    vi.advanceTimersByTime(500);
    expect(onUse).not.toHaveBeenCalled();
    expect(event.sp).toBe(12);
    ai.destroy();
  });

  test("rejects a same-id replacement of a captured secondary area target", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const event = { ...createEvent(), sp: 12 };
    const onUse = vi.fn();
    const skill = {
      id: "measured-sweep",
      spCost: 4,
      targeting: {
        range: 2,
        aoeMask: ["111", "111", "111"],
      },
      action: { mode: "instant" as const, target: "enemy" as const },
      onUse,
    };
    const primary = {
      ...createPlayer(),
      id: "primary",
      hp: 10,
      x: vi.fn(() => 32),
      y: vi.fn(() => 0),
    };
    const firstSecondary = {
      ...createPlayer(),
      id: "secondary",
      hp: 10,
      x: vi.fn(() => 32),
      y: vi.fn(() => 0),
    };
    const replacementSecondary = {
      ...createPlayer(),
      id: "secondary",
      hp: 10,
      x: vi.fn(() => 32),
      y: vi.fn(() => 0),
    };
    let secondary = firstSecondary;
    const map = {
      tileWidth: 32,
      tileHeight: 32,
      getPlayers: () => [primary, secondary],
      getEvents: () => [event],
      clientVisual: vi.fn(),
    };
    event.getCurrentMap.mockReturnValue(map);
    const ai = new BattleAi(event as any, {
      attackSkill: skill,
      attackRange: 80,
    });
    clearInterval((ai as any).updateInterval);
    (ai as any).updateInterval = undefined;
    ai.onDetectInShape(primary as any, {});

    const evaluation = (ai as any).evaluateSkillActions(1_000)[0];
    expect(evaluation.target).toEqual([primary, firstSecondary]);
    expect((ai as any).performPlannedSkill(evaluation)).toBe(true);
    secondary = replacementSecondary;
    vi.advanceTimersByTime(500);

    expect(onUse).not.toHaveBeenCalled();
    expect(event.sp).toBe(12);
    expect((ai as any).skillCooldowns.size).toBe(0);
    ai.destroy();
  });

  test.each(["missing", "dead", "replaced"] as const)(
    "keeps delayed self support independent when the selected target is %s",
    (targetChange) => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000);
      const event = {
        ...createEvent(),
        hp: 5,
        sp: 12,
      };
      const onUse = vi.fn();
      const skill = {
        id: "steady-self",
        skillType: "support",
        spCost: 4,
        action: { mode: "instant" as const, target: "self" as const },
        onUse,
      };
      const original = {
        ...createPlayer(),
        id: "original",
        hp: 10,
        x: vi.fn(() => 20),
        y: vi.fn(() => 0),
      };
      const replacement = {
        ...createPlayer(),
        id: "replacement",
        hp: 10,
        x: vi.fn(() => -20),
        y: vi.fn(() => 0),
      };
      const ai = new BattleAi(event as any, {
        attackSkill: skill,
        attackRange: 50,
      });
      clearInterval((ai as any).updateInterval);
      (ai as any).updateInterval = undefined;
      ai.onDetectInShape(original as any, {});

      const evaluation = (ai as any).evaluateSkillActions(1_000)[0];
      expect(evaluation.target).toBe(event);
      expect((ai as any).performPlannedSkill(evaluation)).toBe(true);
      if (targetChange === "missing") {
        (ai as any).target = null;
      } else if (targetChange === "dead") {
        original.hp = 0;
      } else {
        (ai as any).target = replacement;
      }
      vi.advanceTimersByTime(500);

      expect(onUse).toHaveBeenCalledOnce();
      expect(event.sp).toBe(8);
      ai.destroy();
    },
  );

  test.each([
    { label: "Stunned", states: [AiState.Stunned] },
    { label: "Flee", states: [AiState.Flee] },
    { label: "Idle", states: [AiState.Idle] },
    {
      label: "Idle and immediately back to Combat",
      states: [AiState.Idle, AiState.Combat],
    },
  ])(
    "cancels delayed self support when its actor leaves Combat for $label",
    ({ states }) => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000);
      const event = {
        ...createEvent(),
        hp: 5,
        sp: 12,
      };
      const onUse = vi.fn();
      const skill = {
        id: "interrupted-self",
        skillType: "support",
        spCost: 4,
        action: { mode: "instant" as const, target: "self" as const },
        onUse,
      };
      const target = {
        ...createPlayer(),
        hp: 10,
        x: vi.fn(() => 20),
        y: vi.fn(() => 0),
      };
      const ai = new BattleAi(event as any, {
        attackSkill: skill,
        attackRange: 50,
      });
      clearInterval((ai as any).updateInterval);
      (ai as any).updateInterval = undefined;
      ai.onDetectInShape(target as any, {});
      ai.onDetectInShape(target as any, {});
      const evaluation = (ai as any).evaluateSkillActions(1_000)[0];

      expect((ai as any).performPlannedSkill(evaluation)).toBe(true);
      for (const state of states) (ai as any).changeState(state);
      vi.advanceTimersByTime(500);

      expect(onUse).not.toHaveBeenCalled();
      expect(event.sp).toBe(12);
      expect((ai as any).skillCooldowns.size).toBe(0);
      ai.destroy();
    },
  );

  test("revalidates a newly introduced projectile blocker before skill hooks or spend", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const physics = new PhysicsEngine({ spatialCellSize: 8 });
    const onUse = vi.fn();
    const skill = {
      id: "planned-bolt",
      spCost: 4,
      action: {
        mode: "projectile" as const,
        target: "enemy" as const,
        projectile: {
          direction: { x: 1, y: 0 },
          range: 80,
        },
      },
      onUse,
    };
    const event = {
      ...createEvent(),
      sp: 12,
      hitbox: () => ({ w: 8, h: 8 }),
    };
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 40),
      y: vi.fn(() => 0),
      hitbox: () => ({ w: 8, h: 8 }),
    };
    const objects = new Map<string, any>([
      [event.id, event],
      [player.id, player],
    ]);
    const map = {
      tileWidth: 10,
      tileHeight: 10,
      physic: physics,
      getObjectById: (id: string) => objects.get(id),
      getPlayers: () => [player],
      getEvents: () => [event],
      clientVisual: vi.fn(),
    };
    event.getCurrentMap.mockReturnValue(map);
    for (const entry of [event, player]) {
      physics.createEntity({
        uuid: entry.id,
        position: { x: entry.x() + 4, y: entry.y() + 4 },
        width: 8,
        height: 8,
      });
    }
    const ai = new BattleAi(event as any, {
      faction: "enemies",
      targets: "players",
      attackSkill: skill,
      attackRange: 50,
    });
    clearInterval((ai as any).updateInterval);
    (ai as any).updateInterval = undefined;
    ai.onDetectInShape(player as any, {});
    const evaluation = (ai as any).evaluateSkillActions(1_000)[0];
    expect(evaluation.rejection).toBeUndefined();
    expect((ai as any).performPlannedSkill(evaluation)).toBe(true);

    physics.createStaticObstacle("startup-wall", {
      x: 28,
      y: 4,
      width: 8,
      height: 8,
    });
    vi.advanceTimersByTime(500);

    expect(onUse).not.toHaveBeenCalled();
    expect(event.sp).toBe(12);
    expect((ai as any).skillCooldowns.size).toBe(0);
    ai.destroy();
  });

  test("selects a learned ranged skill while keeping other learned skills", () => {
    const event = createEvent();
    const clientVisual = vi.fn();
    const melee = {
      id: "slash",
      spCost: 0,
      action: { mode: "melee", target: "enemy" },
    };
    const projectile = {
      id: () => "fireball",
      skillType: () => "magical",
      animation: () => "fireball-impact",
      spCost: 0,
      targeting: { range: 6 },
      action: { mode: "projectile", target: "enemy" },
    };
    (event as any).skills = vi.fn(() => [melee, projectile]);
    event.getCurrentMap.mockReturnValue({
      tileWidth: 32,
      tileHeight: 32,
      getPlayers: () => [],
      getEvents: () => [],
      clientVisual,
    });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 150),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, { attackRange: 50 });
    ai.onDetectInShape(player as any, {});

    const evaluations = (ai as any).evaluateSkillActions(1000);
    expect(evaluations.map((entry: any) => entry.id)).toEqual([
      "slash",
      "fireball",
    ]);
    const selection = (ai as any).selectCombatAction(evaluations, 150);
    expect(selection).toMatchObject({
      kind: "skill",
      evaluation: { id: "fireball", mode: "projectile" },
    });
    expect((ai as any).performPlannedSkill(selection.evaluation)).toBe(true);
    expect(clientVisual).toHaveBeenCalledWith(
      ACTION_BATTLE_CLIENT_VISUAL_ID,
      expect.objectContaining({
        moment: "castSkill",
        skill: expect.objectContaining({
          id: "fireball",
          skillType: "magical",
          animation: "fireball-impact",
        }),
      })
    );
    ai.destroy();
  });

  test("strafes laterally while already inside its preferred range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const event = createEvent();
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 40),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackRange: 50,
      moveToCooldown: 0,
    });
    ai.onDetectInShape(player as any, {});

    (ai as any).handleSmartCombatMovement(40, [], 1000);

    expect(event.moveTo).toHaveBeenCalledWith({ x: 0, y: 32 });
    ai.destroy();
  });

  test("executes advanced server intents and emits a generic visual cue", () => {
    vi.useFakeTimers();
    const clientVisual = vi.fn();
    const event = createEvent();
    event.getCurrentMap.mockReturnValue({ clientVisual });
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const customRun = vi.fn();
    const customAction = vi.fn();
    setActionBattleSystems({
      ai: {
        actions: {
          enrage: customAction,
        },
      },
    });
    const ai = new BattleAi(event as any, {
      moveToCooldown: 0,
      behaviorTree: () => ({
        status: "success",
        intent: [
          run(customRun),
          setSpeed(7),
          moveToPoint({ x: 40, y: 60 }),
          holdPosition(),
          teleportTo({ x: 80, y: 90 }),
          visual({ kind: "rage", durationMs: 500 }),
          callAction("enrage", { multiplier: 2 }),
        ],
      }),
    });

    vi.advanceTimersByTime(100);

    expect(customRun).toHaveBeenCalledWith(
      expect.objectContaining({ event, memory: expect.any(Object) })
    );
    expect(event.speed).toBe(7);
    expect(event.moveTo).toHaveBeenCalledWith({ x: 40, y: 60 });
    expect(event.teleport).toHaveBeenCalledWith({ x: 80, y: 90 });
    expect(customAction).toHaveBeenCalledWith(
      expect.objectContaining({ event }),
      { multiplier: 2 }
    );
    expect(clientVisual).toHaveBeenCalledWith(
      ACTION_BATTLE_CLIENT_VISUAL_ID,
      expect.objectContaining({
        moment: "ai",
        objectId: "monster-1",
        visual: {
          kind: "rage",
          durationMs: 500,
        },
      })
    );
    ai.destroy();
  });

  test("continues with default AI when a registered action is unknown", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 120),
      y: vi.fn(() => 0),
    };
    const ai = new BattleAi(event as any, {
      attackRange: 50,
      visionRange: 150,
      moveToCooldown: 0,
      behaviorTree: () => ({
        status: "success",
        intent: callAction("not-registered"),
      }),
    });

    ai.onDetectInShape(player as any, {});
    vi.advanceTimersByTime(100);

    expect(event.moveTo).toHaveBeenCalledWith(player);
    ai.destroy();
  });

  test("teleports near the current target using a server-selected position", () => {
    vi.useFakeTimers();
    const event = createEvent();
    event.attachShape.mockReturnValue({ id: "vision_monster-1" });
    const player = {
      ...createPlayer(),
      hp: 10,
      x: vi.fn(() => 100),
      y: vi.fn(() => 50),
    };
    const ai = new BattleAi(event as any, {
      behaviorTree: () => ({
        status: "success",
        intent: teleportNearTarget({
          distance: 30,
          angleDegrees: 0,
        }),
      }),
    });

    ai.onDetectInShape(player as any, {});
    vi.advanceTimersByTime(100);

    expect(event.teleport).toHaveBeenCalledWith({ x: 130, y: 50 });
    ai.destroy();
  });
});
