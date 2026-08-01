import { describe, expect, expectTypeOf, test, vi } from "vitest";
import { AiState, AttackPattern, EnemyType } from "../ai.server";
import { acknowledgeActionBattleAiIntentExecution } from "./ai-intent-execution";
import {
  action,
  chase,
  condition,
  cooldown,
  defineAiBehavior,
  hpBelow,
  ifHpBelow,
  ifTargetInRange,
  keepDistance,
  once,
  phase,
  selector,
  sequence,
  sequenceWithDelay,
  targetInRange,
  useAttack,
  useSkill,
  visual,
  wait,
} from "./ai-behavior-tree";

const createContext = (overrides: Record<string, any> = {}) => {
  const event = { id: "enemy-1" };
  const target = { id: "player-1" };
  const distance = overrides.distance ?? 40;
  return {
    event,
    target,
    state: AiState.Combat,
    enemyType: EnemyType.Aggressive,
    distance,
    hpPercent: overrides.hpPercent ?? 0.8,
    now: 100,
    self: {
      event,
      state: AiState.Combat,
      enemyType: EnemyType.Aggressive,
      hpPercent: overrides.hpPercent ?? 0.8,
      attackRange: overrides.attackRange ?? 50,
    },
    targetInfo: overrides.targetInfo ?? {
      entity: target,
      distance,
      inAttackRange: distance <= (overrides.attackRange ?? 50),
      visible: true,
    },
    memory: {},
    ...overrides,
  } as any;
};

describe("action battle AI behavior tree", () => {
  test("selects the first successful branch", () => {
    const tree = selector([
      sequence([condition(hpBelow(0.2)), action(chase())]),
      sequence([condition(targetInRange()), action(useAttack(AttackPattern.Melee))]),
      action(keepDistance(80)),
    ]);

    const result = tree.tick(createContext());

    expect(result.status).toBe("success");
    expect(result.intent).toEqual({
      type: "useAttack",
      pattern: AttackPattern.Melee,
    });
  });

  test("compiles simplified rules to a behavior tree", () => {
    const behavior = defineAiBehavior({
      when: [
        ifHpBelow(0.25, keepDistance(120)),
        ifTargetInRange(useAttack("melee")),
      ],
      otherwise: chase(),
    });

    expect(behavior.tick(createContext({ hpPercent: 0.1 })).intent).toEqual({
      type: "keepDistance",
      distance: 120,
      tolerance: undefined,
    });
    expect(behavior.tick(createContext({ distance: 30 })).intent).toEqual({
      type: "useAttack",
      pattern: "melee",
    });
    expect(behavior.tick(createContext({ distance: 90 })).intent).toEqual({
      type: "moveToTarget",
    });
  });

  test("supports dynamic actions with memory", () => {
    const behavior = defineAiBehavior({
      otherwise: ({ memory }) => {
        memory.ticks = (memory.ticks ?? 0) + 1;
        return useAttack(memory.ticks === 1 ? "melee" : "dashAttack");
      },
    });
    const context = createContext();

    expect(behavior.tick(context).intent).toEqual({
      type: "useAttack",
      pattern: "melee",
    });
    expect(behavior.tick(context).intent).toEqual({
      type: "useAttack",
      pattern: "dashAttack",
    });
  });

  test("does not evaluate later selector branches after success", () => {
    const later = vi.fn(() => ({ status: "success" as const, intent: chase() }));
    const tree = selector([action(useAttack("melee")), later]);

    const result = tree.tick(createContext());

    expect(result.intent).toEqual({ type: "useAttack", pattern: "melee" });
    expect(later).not.toHaveBeenCalled();
  });

  test("runs named synchronous nodes once per AI memory", () => {
    const execute = vi.fn();
    const node = once("rage", {
      tick() {
        execute();
        return { status: "success" };
      },
    });
    const firstContext = createContext();
    const secondContext = createContext();

    expect(node.tick(firstContext)).toEqual({ status: "success" });
    expect(node.tick(firstContext)).toEqual({ status: "failure" });
    expect(node.tick(secondContext).status).toBe("success");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  test("starts a named cooldown only after action success", () => {
    const node = cooldown("shout", 100, visual({ kind: "bubble", text: "!" }));
    const context = createContext({ now: 100 });

    expect(node.tick(context).status).toBe("success");
    context.now = 199;
    expect(node.tick(context)).toEqual({ status: "failure" });
    context.now = 200;
    expect(node.tick(context).status).toBe("success");
  });

  test("runs delayed sequences without replaying completed intents", () => {
    const node = sequenceWithDelay("combo", [
      visual({ kind: "charge" }),
      wait(50),
      useAttack("charged"),
    ]);
    const context = createContext({ now: 100 });

    expect(node.tick(context)).toEqual({
      status: "running",
      intent: visual({ kind: "charge" }),
    });
    context.now = 110;
    expect(node.tick(context)).toEqual({ status: "running" });
    context.now = 159;
    expect(node.tick(context)).toEqual({ status: "running" });
    context.now = 160;
    expect(node.tick(context)).toEqual({
      status: "success",
      intent: useAttack("charged"),
    });
  });

  test("completes an HP phase once after its delayed sequence", () => {
    const node = phase(
      "rage",
      0.5,
      sequenceWithDelay("rage-steps", [
        visual({ kind: "rage" }),
        wait(10),
        useAttack("dashAttack"),
      ])
    );
    const context = createContext({ hpPercent: 0.4, now: 0 });

    expect(node.tick(context).status).toBe("running");
    context.now = 1;
    expect(node.tick(context).status).toBe("running");
    context.now = 11;
    const result = node.tick(context);
    expect(result.status).toBe("success");
    acknowledgeActionBattleAiIntentExecution(
      result.intent as ReturnType<typeof useAttack>
    );
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("waits for every combat intent and does not replay acknowledged array entries", () => {
    const skill = { id: "finisher" };
    const node = once("combo", [useAttack("charged"), useSkill(skill)]);
    const context = createContext();

    const first = node.tick(context);
    expect(first.status).toBe("success");
    expect(first.intent).toEqual([useAttack("charged"), useSkill(skill)]);
    acknowledgeActionBattleAiIntentExecution(
      (first.intent as ReturnType<typeof useAttack>[])[0]
    );

    const retry = node.tick(context);
    expect(retry.status).toBe("success");
    expect(retry.intent).toEqual([useSkill(skill)]);
    acknowledgeActionBattleAiIntentExecution(
      (retry.intent as ReturnType<typeof useSkill>[])[0]
    );

    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("preserves nested once ownership when the same authored intent is reused", () => {
    const sharedAttack = useAttack("charged");
    const inner = once("inner", sharedAttack);
    const outer = once("outer", inner);
    const context = createContext();

    const result = outer.tick(context);
    expect(result.intent).not.toBe(sharedAttack);
    expect(JSON.stringify(result.intent)).toBe(JSON.stringify(sharedAttack));
    acknowledgeActionBattleAiIntentExecution(
      result.intent as ReturnType<typeof useAttack>
    );

    expect(inner.tick(context)).toEqual({ status: "failure" });
    expect(outer.tick(context)).toEqual({ status: "failure" });
  });

  test("preserves nested array slot identity after an inner once filters progress", () => {
    const skill = { id: "finisher" };
    const inner = once("inner-array", [
      useAttack("charged"),
      useSkill(skill),
    ]);
    const outer = once("outer-array", inner);
    const context = createContext();

    const first = outer.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      (first.intent as ReturnType<typeof useAttack>[])[0]
    );

    const retry = outer.tick(context);
    expect(retry.intent).toEqual([useSkill(skill)]);
    acknowledgeActionBattleAiIntentExecution(
      (retry.intent as ReturnType<typeof useSkill>[])[0]
    );

    expect(inner.tick(context)).toEqual({ status: "failure" });
    expect(outer.tick(context)).toEqual({ status: "failure" });
  });

  test("keeps a direct sibling slot when a nested prepared prefix disappears", () => {
    const directSkill = useSkill({ id: "direct-finisher" });
    const inner = once("mixed-inner", useAttack("charged"));
    const child = {
      tick(context: ReturnType<typeof createContext>) {
        const innerResult = inner.tick(context);
        return {
          status: "success" as const,
          intent:
            innerResult.status === "failure"
              ? [directSkill]
              : [
                  innerResult.intent as ReturnType<typeof useAttack>,
                  directSkill,
                ],
        };
      },
    };
    const outer = once("mixed-outer", child);
    const context = createContext();

    const first = outer.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      (first.intent as ReturnType<typeof useAttack>[])[0]
    );

    const retry = outer.tick(context);
    expect(retry.intent).toEqual([directSkill]);
    acknowledgeActionBattleAiIntentExecution(
      (retry.intent as ReturnType<typeof useSkill>[])[0]
    );

    expect(inner.tick(context)).toEqual({ status: "failure" });
    expect(outer.tick(context)).toEqual({ status: "failure" });
  });

  test("keeps semantic slots when a dynamic array recreates and filters intents", () => {
    const openingSkill = { id: "opening" };
    const finishingSkill = { id: "finishing" };
    let tailOnly = false;
    const node = once("dynamic-filter", () =>
      tailOnly
        ? [useSkill(finishingSkill)]
        : [useSkill(openingSkill), useSkill(finishingSkill)]
    );
    const context = createContext();

    const first = node.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      (first.intent as ReturnType<typeof useSkill>[])[0]
    );
    tailOnly = true;

    const retry = node.tick(context);
    expect(retry.intent).toEqual([useSkill(finishingSkill)]);
    acknowledgeActionBattleAiIntentExecution(
      (retry.intent as ReturnType<typeof useSkill>[])[0]
    );

    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("isolates acknowledgements for reused intents across AI memories", () => {
    const sharedAttack = useAttack("charged");
    const node = once("shared", sharedAttack);
    const firstContext = createContext();
    const secondContext = createContext();

    const first = node.tick(firstContext);
    const second = node.tick(secondContext);
    acknowledgeActionBattleAiIntentExecution(
      first.intent as ReturnType<typeof useAttack>
    );

    expect(node.tick(firstContext)).toEqual({ status: "failure" });
    expect(node.tick(secondContext).status).toBe("success");

    acknowledgeActionBattleAiIntentExecution(
      second.intent as ReturnType<typeof useAttack>
    );
    expect(node.tick(secondContext)).toEqual({ status: "failure" });
  });

  test("keeps visual cue payloads JSON-shaped", () => {
    const cue = visual({
      kind: "ground-marker",
      durationMs: 900,
      position: { x: 12, y: 24 },
    });

    expectTypeOf(cue.visual.kind).toEqualTypeOf<string>();
    expect(cue.consume).toBe(false);
  });
});
