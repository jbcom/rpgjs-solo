import { describe, expect, expectTypeOf, test, vi } from "vitest";
import { AiState, AttackPattern, EnemyType } from "../ai.server";
import {
  acknowledgeActionBattleAiIntentExecution,
  cancelActionBattleAiIntentExecutions,
  executeActionBattleAiIntentWithReceipt,
  getActionBattleAiPendingExecutionCountForTests,
} from "./ai-intent-execution";
import {
  action,
  callAction,
  chase,
  condition,
  cooldown,
  defineAiBehavior,
  hpBelow,
  ifHpBelow,
  ifTargetInRange,
  keepDistance,
  moveToPoint,
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

  test("rejects the same inherited one-shot envelope twice", () => {
    const inner = once("inner-duplicate-envelope", callAction("spawn"));
    const context = createContext();
    const inherited = inner.tick(context).intent as ReturnType<typeof callAction>;
    const outer = once("outer-duplicate-envelope", [inherited, inherited]);

    expect(() => outer.tick(context)).toThrow(/same inherited one-shot/);
  });

  test("rejects separate envelopes for the same inherited one-shot slot", () => {
    const inner = once("inner-duplicate-slot", callAction("spawn"));
    const context = createContext();
    const first = inner.tick(context).intent as ReturnType<typeof callAction>;
    const second = inner.tick(context).intent as ReturnType<typeof callAction>;
    expect(second).not.toBe(first);
    const outer = once("outer-duplicate-slot", [first, second]);

    expect(() => outer.tick(context)).toThrow(/same inherited one-shot/);
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

  test("does not replay an acknowledged scalar while another dynamic slot is pending", () => {
    const openingSkill = { id: "opening" };
    const finishingSkill = { id: "finishing" };
    let phase: "both" | "opening" | "finishing" = "both";
    const node = once("dynamic-scalar-filter", () => {
      if (phase === "opening") return useSkill(openingSkill);
      if (phase === "finishing") return useSkill(finishingSkill);
      return [useSkill(openingSkill), useSkill(finishingSkill)];
    });
    const context = createContext();

    const first = node.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      (first.intent as ReturnType<typeof useSkill>[])[0]
    );
    phase = "opening";

    expect(node.tick(context)).toMatchObject({ status: "running", intent: [] });

    phase = "finishing";
    const finishing = node.tick(context);
    expect(finishing.intent).toEqual(useSkill(finishingSkill));
    acknowledgeActionBattleAiIntentExecution(
      finishing.intent as ReturnType<typeof useSkill>
    );
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("keeps a recreated movement pending until authoritative acknowledgement", () => {
    const node = once("dynamic-movement", () =>
      moveToPoint({ x: 64, y: 32 })
    );
    const context = createContext();

    const rejected = node.tick(context);
    expect(rejected.intent).toEqual(moveToPoint({ x: 64, y: 32 }));

    const retry = node.tick(context);
    expect(retry.intent).toEqual(moveToPoint({ x: 64, y: 32 }));
    acknowledgeActionBattleAiIntentExecution(
      retry.intent as ReturnType<typeof moveToPoint>
    );

    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("keeps delimiter-shaped payloads in distinct semantic slots", () => {
    let phase: "both" | "first" | "second" = "both";
    const firstPayload = { value: ["a,string:b"] };
    const secondPayload = { value: ["a", "b"] };
    const node = once("unambiguous-payloads", () => {
      if (phase === "first") return callAction("phase", firstPayload);
      if (phase === "second") return callAction("phase", secondPayload);
      return [
        callAction("phase", firstPayload),
        callAction("phase", secondPayload),
      ];
    });
    const context = createContext();

    const first = node.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      (first.intent as ReturnType<typeof callAction>[])[0]
    );
    phase = "first";
    expect(node.tick(context)).toMatchObject({ status: "running", intent: [] });

    phase = "second";
    const second = node.tick(context);
    expect(second.intent).toEqual(callAction("phase", secondPayload));
    acknowledgeActionBattleAiIntentExecution(
      second.intent as ReturnType<typeof callAction>
    );
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("uses traversal back-references for recreated cyclic payloads", () => {
    const node = once("recreated-cycle", () => {
      const payload: Record<string, unknown> = {};
      payload.self = payload;
      return callAction("cycle", payload);
    });
    const context = createContext();

    expect(node.tick(context).status).toBe("success");
    const retry = node.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      retry.intent as ReturnType<typeof callAction>
    );

    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test.each([
    [[], new Array(1)],
    [["x"], ["x", ,]],
    [new Array(1), [undefined]],
  ])("distinguishes sparse array shapes in receipt payloads", (left, right) => {
    const node = once("sparse-shape", [
      callAction("shape", { values: left }),
      callAction("shape", { values: right }),
    ]);
    const context = createContext();

    const result = node.tick(context);
    expect(result.status).toBe("success");
    expect(result.intent).toHaveLength(2);
    for (const intent of result.intent as ReturnType<typeof callAction>[]) {
      acknowledgeActionBattleAiIntentExecution(intent);
    }
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test.each([
    [
      { value: 1 },
      Object.defineProperty({}, "value", {
        value: 1,
        enumerable: false,
        writable: true,
        configurable: true,
      }),
    ],
    [
      { value: 1 },
      Object.defineProperty({}, "value", {
        value: 1,
        enumerable: true,
        writable: false,
        configurable: true,
      }),
    ],
    [
      { value: 1 },
      Object.defineProperty({}, "value", {
        value: 1,
        enumerable: true,
        writable: true,
        configurable: false,
      }),
    ],
    [
      [1],
      Object.defineProperty([1], "0", {
        value: 1,
        enumerable: false,
        writable: true,
        configurable: true,
      }),
    ],
    [[], Object.defineProperty([], "length", { writable: false })],
  ])("distinguishes data property descriptor shapes", (left, right) => {
    const node = once("descriptor-shape", [
      callAction("shape", { value: left }),
      callAction("shape", { value: right }),
    ]);
    const context = createContext();

    const result = node.tick(context);
    expect(result.status).toBe("success");
    expect(result.intent).toHaveLength(2);
  });

  test("keeps descriptor-distinct slots mapped across dynamic filtering", () => {
    const ordinary = { value: 1 };
    const hidden = Object.defineProperty({}, "value", {
      value: 1,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    let phase: "both" | "ordinary" | "hidden" = "both";
    const node = once("descriptor-filter", () => {
      if (phase === "ordinary") return callAction("shape", ordinary);
      if (phase === "hidden") return callAction("shape", hidden);
      return [callAction("shape", ordinary), callAction("shape", hidden)];
    });
    const context = createContext();

    const first = node.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      (first.intent as ReturnType<typeof callAction>[])[0]
    );
    phase = "ordinary";
    expect(node.tick(context)).toMatchObject({ status: "running", intent: [] });
    phase = "hidden";
    const second = node.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      second.intent as ReturnType<typeof callAction>
    );
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("distinguishes ordinary and null-prototype record payloads", () => {
    const ordinary = { value: 1 };
    const nullPrototype = Object.assign(Object.create(null), { value: 1 });
    const node = once("record-prototype", [
      callAction("shape", ordinary),
      callAction("shape", nullPrototype),
    ]);

    expect(() => node.tick(createContext())).not.toThrow();
  });

  test("tracks global and local symbol keys without retaining local symbols strongly", () => {
    const globalKey = Symbol.for("action-battle-global-key");
    const localKey = Symbol("action-battle-local-key");
    const globalPayload = { [globalKey]: "global" };
    const localPayload = { [localKey]: "local" };
    const node = once("symbol-keys", [
      callAction("shape", globalPayload),
      callAction("shape", localPayload),
    ]);
    const context = createContext();

    const first = node.tick(context);
    expect(first.intent).toHaveLength(2);
    for (const intent of first.intent as ReturnType<typeof callAction>[]) {
      acknowledgeActionBattleAiIntentExecution(intent);
    }
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("tracks global and local symbol values as distinct payloads", () => {
    const globalValue = Symbol.for("action-battle-global-value");
    const localValue = Symbol("action-battle-local-value");
    const node = once("symbol-values", [
      callAction("shape", { value: globalValue }),
      callAction("shape", { value: localValue }),
    ]);

    expect(() => node.tick(createContext())).not.toThrow();
  });

  test("bounds structural inspection for exceptionally deep payloads", () => {
    const createDeepPayload = () => {
      const root: Record<string, unknown> = {};
      let cursor = root;
      for (let index = 0; index < 12_000; index++) {
        const next: Record<string, unknown> = {};
        cursor.next = next;
        cursor = next;
      }
      return root;
    };
    const staticNode = once(
      "deep-static-payload",
      callAction("deep", createDeepPayload())
    );
    expect(() => staticNode.tick(createContext())).not.toThrow();

    const node = once("deep-dynamic-payload", () => ({
      ...callAction("deep", createDeepPayload()),
      receiptKey: "deep-action",
    }));
    const context = createContext();

    expect(() => node.tick(context)).not.toThrow();
    const retry = node.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      retry.intent as ReturnType<typeof callAction>
    );
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test.each([
    [
      { first: 1, second: 2 },
      Object.assign({}, { second: 2 }, { first: 1 }),
    ],
    [{}, Object.preventExtensions({})],
    [[], Object.setPrototypeOf([], null)],
  ])("distinguishes observable object boundary shapes", (left, right) => {
    const node = once("object-boundary", [
      callAction("shape", { value: left }),
      callAction("shape", { value: right }),
    ]);

    expect(() => node.tick(createContext())).not.toThrow();
  });

  test("does not invoke getter-backed ids while tracking receipts", () => {
    const idGetter = vi.fn(() => `changing-${Math.random()}`);
    const skill = Object.defineProperty({}, "id", {
      enumerable: true,
      get: idGetter,
    });
    const node = once("getter-id", () => useSkill(skill));
    const context = createContext();

    expect(node.tick(context).status).toBe("success");
    const retry = node.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      retry.intent as ReturnType<typeof useSkill>
    );

    expect(node.tick(context)).toEqual({ status: "failure" });
    expect(idGetter).not.toHaveBeenCalled();
  });

  test("falls back to identity when payload reflection is refused", () => {
    const payload = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("reflection refused");
        },
      }
    );
    const node = once("opaque-proxy", () => callAction("opaque", payload));
    const context = createContext();

    expect(() => node.tick(context)).not.toThrow();
    const retry = node.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      retry.intent as ReturnType<typeof callAction>
    );
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("preserves rejected work across a temporarily empty dynamic result", () => {
    let visible = true;
    const node = once("temporarily-empty", () =>
      visible ? [callAction("phase")] : []
    );
    const context = createContext();

    expect(node.tick(context).intent).toEqual([callAction("phase")]);
    visible = false;
    expect(node.tick(context)).toMatchObject({ status: "running", intent: [] });
    visible = true;
    const retry = node.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      (retry.intent as ReturnType<typeof callAction>[])[0]
    );
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("preserves rejected work when a dynamic node temporarily has no intent", () => {
    let visible = true;
    const dynamicNode = {
      tick() {
        return visible
          ? {
              status: "success" as const,
              intent: callAction("phase"),
            }
          : { status: "success" as const };
      },
    };
    const node = once("temporarily-absent", dynamicNode);
    const context = createContext();

    expect(node.tick(context).intent).toEqual(callAction("phase"));
    visible = false;
    expect(node.tick(context)).toEqual({ status: "running" });
    visible = true;
    const retry = node.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      retry.intent as ReturnType<typeof callAction>
    );
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("requires stable receipt keys for semantically duplicate siblings", () => {
    const ambiguous = once("ambiguous-duplicates", [
      callAction("hit", { n: 1 }),
      callAction("hit", { n: 1 }),
    ]);

    expect(() => ambiguous.tick(createContext())).toThrow(/receiptKey/);

    const identified = once("identified-duplicates", [
      { ...callAction("hit", { n: 1 }), receiptKey: "opening" },
      { ...callAction("hit", { n: 1 }), receiptKey: "finisher" },
    ]);
    const context = createContext();
    const first = identified.tick(context);
    acknowledgeActionBattleAiIntentExecution(
      (first.intent as ReturnType<typeof callAction>[])[0]
    );
    const retry = identified.tick(context);
    expect(retry.intent).toEqual([
      { ...callAction("hit", { n: 1 }), receiptKey: "finisher" },
    ]);
    acknowledgeActionBattleAiIntentExecution(
      (retry.intent as ReturnType<typeof callAction>[])[0]
    );
    expect(identified.tick(context)).toEqual({ status: "failure" });
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

  test("rejects a stale envelope after its semantic slot is acknowledged", () => {
    const node = once("stale-sync-envelope", callAction("spawn"));
    const context = createContext();
    const first = node.tick(context).intent as ReturnType<typeof callAction>;
    const stale = node.tick(context).intent as ReturnType<typeof callAction>;
    const executor = {};
    const executeFirst = vi.fn(() => true);
    const executeStale = vi.fn(() => true);

    expect(
      executeActionBattleAiIntentWithReceipt(first, executor, executeFirst)
    ).toBe(true);
    expect(
      executeActionBattleAiIntentWithReceipt(stale, executor, executeStale)
    ).toBe(false);
    expect(executeFirst).toHaveBeenCalledOnce();
    expect(executeStale).not.toHaveBeenCalled();
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("rejects a stale envelope while its semantic slot is in flight", async () => {
    const node = once("stale-async-envelope", callAction("spawn"));
    const context = createContext();
    const first = node.tick(context).intent as ReturnType<typeof callAction>;
    const stale = node.tick(context).intent as ReturnType<typeof callAction>;
    const executor = {};
    let resolveExecution: ((value: boolean) => void) | undefined;
    const executeFirst = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveExecution = resolve;
        })
    );
    const executeStale = vi.fn(() => true);

    expect(
      executeActionBattleAiIntentWithReceipt(first, executor, executeFirst)
    ).toBe(true);
    expect(
      executeActionBattleAiIntentWithReceipt(stale, executor, executeStale)
    ).toBe(false);
    expect(executeStale).not.toHaveBeenCalled();
    resolveExecution?.(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("claims a semantic slot before synchronous reentrant execution", () => {
    const node = once("reentrant-sync-envelope", callAction("spawn"));
    const context = createContext();
    const first = node.tick(context).intent as ReturnType<typeof callAction>;
    const stale = node.tick(context).intent as ReturnType<typeof callAction>;
    const executor = {};
    const staleEffect = vi.fn(() => true);
    let nestedAccepted: boolean | undefined;
    const firstEffect = vi.fn(() => {
      nestedAccepted = executeActionBattleAiIntentWithReceipt(
        stale,
        executor,
        staleEffect
      );
      return true;
    });

    expect(
      executeActionBattleAiIntentWithReceipt(first, executor, firstEffect)
    ).toBe(true);
    expect(nestedAccepted).toBe(false);
    expect(firstEffect).toHaveBeenCalledOnce();
    expect(staleEffect).not.toHaveBeenCalled();
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("claims a semantic slot before promise-producing reentrant execution", async () => {
    const node = once("reentrant-async-envelope", callAction("spawn"));
    const context = createContext();
    const first = node.tick(context).intent as ReturnType<typeof callAction>;
    const stale = node.tick(context).intent as ReturnType<typeof callAction>;
    const executor = {};
    const staleEffect = vi.fn(() => true);
    let nestedAccepted: boolean | undefined;
    const firstEffect = vi.fn(() => {
      nestedAccepted = executeActionBattleAiIntentWithReceipt(
        stale,
        executor,
        staleEffect
      );
      return Promise.resolve(true);
    });

    expect(
      executeActionBattleAiIntentWithReceipt(first, executor, firstEffect)
    ).toBe(true);
    expect(nestedAccepted).toBe(false);
    expect(staleEffect).not.toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("tombstones one-use envelopes after synchronous execution", () => {
    const node = once("exact-sync-replay", callAction("spawn"));
    const context = createContext();
    const envelope = node.tick(context).intent as ReturnType<typeof callAction>;
    const executor = {};
    const effect = vi.fn(() => true);

    expect(executeActionBattleAiIntentWithReceipt(envelope, executor, effect)).toBe(true);
    expect(executeActionBattleAiIntentWithReceipt(envelope, executor, effect)).toBe(false);
    expect(effect).toHaveBeenCalledOnce();
  });

  test("tombstones one-use envelopes during asynchronous execution", async () => {
    const node = once("exact-async-replay", callAction("spawn"));
    const context = createContext();
    const envelope = node.tick(context).intent as ReturnType<typeof callAction>;
    const executor = {};
    let resolveEffect: ((value: boolean) => void) | undefined;
    const effect = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveEffect = resolve;
        })
    );

    expect(executeActionBattleAiIntentWithReceipt(envelope, executor, effect)).toBe(true);
    expect(executeActionBattleAiIntentWithReceipt(envelope, executor, effect)).toBe(false);
    expect(effect).toHaveBeenCalledOnce();
    resolveEffect?.(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  test("requires a fresh envelope after false or throwing execution", () => {
    const falseNode = once("false-envelope-retry", callAction("spawn"));
    const falseContext = createContext();
    const rejected = falseNode.tick(falseContext).intent as ReturnType<typeof callAction>;
    const falseEffect = vi.fn(() => false);
    const executor = {};
    expect(
      executeActionBattleAiIntentWithReceipt(rejected, executor, falseEffect)
    ).toBe(false);
    expect(
      executeActionBattleAiIntentWithReceipt(rejected, executor, falseEffect)
    ).toBe(false);
    expect(falseEffect).toHaveBeenCalledOnce();
    const freshAfterFalse = falseNode.tick(falseContext).intent as ReturnType<typeof callAction>;
    expect(
      executeActionBattleAiIntentWithReceipt(freshAfterFalse, executor, () => true)
    ).toBe(true);

    const throwNode = once("throw-envelope-retry", callAction("spawn"));
    const throwContext = createContext();
    const threw = throwNode.tick(throwContext).intent as ReturnType<typeof callAction>;
    const throwEffect = vi.fn(() => {
      throw new Error("action failed");
    });
    expect(() =>
      executeActionBattleAiIntentWithReceipt(threw, executor, throwEffect)
    ).toThrow("action failed");
    expect(
      executeActionBattleAiIntentWithReceipt(threw, executor, throwEffect)
    ).toBe(false);
    expect(throwEffect).toHaveBeenCalledOnce();
    const freshAfterThrow = throwNode.tick(throwContext).intent as ReturnType<typeof callAction>;
    expect(
      executeActionBattleAiIntentWithReceipt(freshAfterThrow, executor, () => true)
    ).toBe(true);
  });

  test("keeps a fresh pending set when an old cancelled promise settles", async () => {
    const node = once("cancelled-promise-generation", callAction("spawn"));
    const context = createContext();
    const executor = {};
    const first = node.tick(context).intent as ReturnType<typeof callAction>;
    let resolveFirst: ((value: boolean) => void) | undefined;
    executeActionBattleAiIntentWithReceipt(
      first,
      executor,
      () =>
        new Promise<boolean>((resolve) => {
          resolveFirst = resolve;
        })
    );
    cancelActionBattleAiIntentExecutions(executor);

    const second = node.tick(context).intent as ReturnType<typeof callAction>;
    let resolveSecond: ((value: boolean) => void) | undefined;
    executeActionBattleAiIntentWithReceipt(
      second,
      executor,
      () =>
        new Promise<boolean>((resolve) => {
          resolveSecond = resolve;
        })
    );
    expect(getActionBattleAiPendingExecutionCountForTests(executor)).toBe(1);

    resolveFirst?.(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(getActionBattleAiPendingExecutionCountForTests(executor)).toBe(1);

    cancelActionBattleAiIntentExecutions(executor);
    resolveSecond?.(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(getActionBattleAiPendingExecutionCountForTests(executor)).toBe(0);
    const finalEnvelope = node.tick(context).intent as ReturnType<typeof callAction>;
    expect(
      executeActionBattleAiIntentWithReceipt(finalEnvelope, executor, () => true)
    ).toBe(true);
    expect(node.tick(context)).toEqual({ status: "failure" });
  });

  test("tombstones an envelope cancelled during synchronous execution", () => {
    const node = once("cancelled-sync-envelope", callAction("spawn"));
    const context = createContext();
    const envelope = node.tick(context).intent as ReturnType<typeof callAction>;
    const executor = {};
    const effect = vi.fn(() => {
      cancelActionBattleAiIntentExecutions(executor);
      return true;
    });

    expect(executeActionBattleAiIntentWithReceipt(envelope, executor, effect)).toBe(false);
    expect(executeActionBattleAiIntentWithReceipt(envelope, executor, effect)).toBe(false);
    expect(effect).toHaveBeenCalledOnce();
  });

  test("does not let another once node reauthorize a settled envelope", () => {
    const inner = once("settled-inner-envelope", callAction("spawn"));
    const context = createContext();
    const settled = inner.tick(context).intent as ReturnType<typeof callAction>;
    expect(
      executeActionBattleAiIntentWithReceipt(settled, {}, () => false)
    ).toBe(false);
    const outer = once("settled-outer-envelope", settled);

    expect(() => outer.tick(context)).toThrow(/settled one-use envelope/);
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
