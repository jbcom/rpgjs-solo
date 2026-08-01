import type { ActionBattleAiIntent } from "./ai-behavior-tree";

type DeferredActionBattleAiIntent = Extract<
  ActionBattleAiIntent,
  { type: "useAttack" | "useSkill" }
>;

interface ActionBattleAiCompletionSlot {
  acknowledged: boolean;
}

interface ActionBattleAiCompletionState {
  completed: boolean;
  directSlots: ActionBattleAiCompletionSlot[];
  inheritedSlots: Map<
    ActionBattleAiCompletionSlot,
    ActionBattleAiCompletionSlot
  >;
  slots: ActionBattleAiCompletionSlot[];
}

interface ActionBattleAiIntentReceiptBinding {
  state: ActionBattleAiCompletionState;
  slot: ActionBattleAiCompletionSlot;
}

interface ActionBattleAiIntentReceipt {
  bindings: ActionBattleAiIntentReceiptBinding[];
}

/** Opaque, per-`once()` progress value stored in one AI instance's memory. */
export type ActionBattleAiIntentCompletion = object;

const completionStates = new WeakMap<
  ActionBattleAiIntentCompletion,
  ActionBattleAiCompletionState
>();
const executionReceipts = new WeakMap<
  ActionBattleAiIntent,
  ActionBattleAiIntentReceipt
>();
const pendingReceiptsByExecutor = new Map<
  object,
  Set<ActionBattleAiIntent>
>();

const isDeferredIntent = (
  intent: ActionBattleAiIntent
): intent is DeferredActionBattleAiIntent =>
  intent.type === "useAttack" || intent.type === "useSkill";

const createSlot = (
  state: ActionBattleAiCompletionState
): ActionBattleAiCompletionSlot => {
  const slot = { acknowledged: false };
  state.slots.push(slot);
  return slot;
};

const getOrCreateDirectSlot = (
  state: ActionBattleAiCompletionState,
  index: number
): ActionBattleAiCompletionSlot =>
  (state.directSlots[index] ??= createSlot(state));

const getOrCreateInheritedSlot = (
  state: ActionBattleAiCompletionState,
  inherited: ActionBattleAiCompletionSlot
): ActionBattleAiCompletionSlot => {
  const existing = state.inheritedSlots.get(inherited);
  if (existing) return existing;
  const slot = createSlot(state);
  state.inheritedSlots.set(inherited, slot);
  return slot;
};

const acknowledgeReceipt = (receipt: ActionBattleAiIntentReceipt): void => {
  for (const { state, slot } of receipt.bindings) {
    slot.acknowledged = true;
    if (state.slots.every((candidate) => candidate.acknowledged)) {
      state.completed = true;
    }
  }
};

/** Create an opaque completion token without retaining the behavior context. */
export const createActionBattleAiIntentCompletion =
  (): ActionBattleAiIntentCompletion => {
    const completion = Object.freeze(Object.create(null)) as object;
    completionStates.set(completion, {
      completed: false,
      directSlots: [],
      inheritedSlots: new Map(),
      slots: [],
    });
    return completion;
  };

export const isActionBattleAiIntentCompletion = (
  value: unknown
): value is ActionBattleAiIntentCompletion =>
  typeof value === "object" &&
  value !== null &&
  completionStates.has(value as object);

export const isActionBattleAiIntentCompletionComplete = (
  completion: ActionBattleAiIntentCompletion
): boolean => completionStates.get(completion)?.completed === true;

/**
 * Clone deferred combat intents into one-use execution envelopes.
 *
 * Receipt metadata lives only in this module's WeakMaps. Nested `once()`
 * nodes inherit the inner slot identity, allowing every owner to acknowledge
 * the same authoritative execution without changing the public intent shape.
 */
export const prepareActionBattleAiIntentCompletion = (
  input: ActionBattleAiIntent | ActionBattleAiIntent[],
  completion: ActionBattleAiIntentCompletion
): {
  deferred: boolean;
  intent: ActionBattleAiIntent | ActionBattleAiIntent[];
} => {
  const state = completionStates.get(completion);
  if (!state) return { deferred: false, intent: input };

  const intents = Array.isArray(input) ? input : [input];
  const prepared: ActionBattleAiIntent[] = [];
  let deferred = false;
  let directIndex = 0;

  for (const intent of intents) {
    if (!isDeferredIntent(intent)) {
      prepared.push(intent);
      continue;
    }

    deferred = true;
    const inheritedReceipt = executionReceipts.get(intent);
    const inheritedSlot = inheritedReceipt?.bindings[0]?.slot;
    const slot = inheritedSlot
      ? getOrCreateInheritedSlot(state, inheritedSlot)
      : getOrCreateDirectSlot(state, directIndex);
    directIndex++;

    if (slot.acknowledged) continue;

    const envelope = { ...intent } as ActionBattleAiIntent;
    executionReceipts.set(envelope, {
      bindings: [
        ...(inheritedReceipt?.bindings ?? []),
        { state, slot },
      ],
    });
    prepared.push(envelope);
  }

  return {
    deferred,
    intent: Array.isArray(input) ? prepared : (prepared[0] ?? input),
  };
};

/** Acknowledge a prepared envelope after authoritative combat execution. */
export const acknowledgeActionBattleAiIntentExecution = (
  intent: ActionBattleAiIntent
): void => {
  const receipt = executionReceipts.get(intent);
  if (!receipt) return;
  executionReceipts.delete(intent);
  acknowledgeReceipt(receipt);
};

/**
 * Execute one intent while its internal receipt is owned by an executor.
 * Rejections abandon the one-use envelope; the next behavior tick emits a
 * fresh envelope for the still-pending progress slot.
 */
export const executeActionBattleAiIntentWithReceipt = (
  intent: ActionBattleAiIntent,
  executor: object,
  execute: () => boolean
): boolean => {
  if (!executionReceipts.has(intent)) return execute();

  const pending = pendingReceiptsByExecutor.get(executor) ?? new Set();
  pendingReceiptsByExecutor.set(executor, pending);
  pending.add(intent);

  try {
    const executed = execute();
    if (executed) acknowledgeActionBattleAiIntentExecution(intent);
    return executed;
  } finally {
    pending.delete(intent);
    if (pending.size === 0) pendingReceiptsByExecutor.delete(executor);
    executionReceipts.delete(intent);
  }
};

/** Abandon every currently executing receipt owned by an executor. */
export const cancelActionBattleAiIntentExecutions = (executor: object): void => {
  const pending = pendingReceiptsByExecutor.get(executor);
  if (!pending) return;
  for (const intent of pending) executionReceipts.delete(intent);
  pendingReceiptsByExecutor.delete(executor);
};

/** Internal observability for receipt lifecycle tests. Not publicly exported. */
export const getActionBattleAiPendingExecutionCountForTests = (
  executor?: object
): number => {
  if (executor) return pendingReceiptsByExecutor.get(executor)?.size ?? 0;
  let count = 0;
  for (const pending of pendingReceiptsByExecutor.values()) {
    count += pending.size;
  }
  return count;
};
