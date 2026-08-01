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
  directSlotsByIntent: WeakMap<
    ActionBattleAiIntent,
    ActionBattleAiCompletionSlot[]
  >;
  directSlotsBySemanticKey: Map<string, ActionBattleAiCompletionSlot[]>;
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
const referencedValueIds = new WeakMap<object, number>();
let referencedValueId = 0;

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

const getReferencedValueId = (value: object): number => {
  const existing = referencedValueIds.get(value);
  if (existing !== undefined) return existing;
  const id = referencedValueId++;
  referencedValueIds.set(value, id);
  return id;
};

const getStableValueKey = (value: unknown): string => {
  if (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  ) {
    try {
      const explicitId = (value as { id?: unknown }).id;
      if (
        ["string", "number", "boolean", "bigint"].includes(typeof explicitId)
      ) {
        return `id:${typeof explicitId}:${String(explicitId)}`;
      }
    } catch {
      // A getter-backed skill without a readable id still has stable identity.
    }
    return `ref:${getReferencedValueId(value as object)}`;
  }
  return `${typeof value}:${String(value)}`;
};

const getDirectIntentSemanticKey = (
  intent: DeferredActionBattleAiIntent
): string =>
  // Consumption controls tree handling after execution, not receipt identity.
  intent.type === "useAttack"
    ? `attack:${getStableValueKey(intent.pattern)}`
    : `skill:${getStableValueKey(intent.skill)}`;

const getWeakOccurrence = <Key extends object>(
  occurrences: WeakMap<Key, number>,
  key: Key
): number => {
  const count = occurrences.get(key) ?? 0;
  occurrences.set(key, count + 1);
  return count;
};

const getMapOccurrence = <Key>(
  occurrences: Map<Key, number>,
  key: Key
): number => {
  const count = occurrences.get(key) ?? 0;
  occurrences.set(key, count + 1);
  return count;
};

const selectMappedSlot = (
  slots: ActionBattleAiCompletionSlot[] | undefined,
  occurrence: number,
  claimed: Set<ActionBattleAiCompletionSlot>
): ActionBattleAiCompletionSlot | undefined => {
  if (!slots) return undefined;
  const indexed = slots[occurrence];
  if (indexed && !claimed.has(indexed) && !indexed.acknowledged) return indexed;
  const pending = slots.find(
    (slot) => !claimed.has(slot) && !slot.acknowledged
  );
  if (pending) return pending;
  if (indexed && !claimed.has(indexed)) return indexed;
  return slots.find((slot) => !claimed.has(slot));
};

const rememberWeakMappedSlot = <Key extends object>(
  mappings: WeakMap<Key, ActionBattleAiCompletionSlot[]>,
  key: Key,
  occurrence: number,
  slot: ActionBattleAiCompletionSlot
): void => {
  const slots = mappings.get(key) ?? [];
  if (!slots.includes(slot)) {
    if (slots[occurrence] === undefined) slots[occurrence] = slot;
    else slots.push(slot);
  }
  mappings.set(key, slots);
};

const rememberMapMappedSlot = <Key>(
  mappings: Map<Key, ActionBattleAiCompletionSlot[]>,
  key: Key,
  occurrence: number,
  slot: ActionBattleAiCompletionSlot
): void => {
  const slots = mappings.get(key) ?? [];
  if (!slots.includes(slot)) {
    if (slots[occurrence] === undefined) slots[occurrence] = slot;
    else slots.push(slot);
  }
  mappings.set(key, slots);
};

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
      directSlotsByIntent: new WeakMap(),
      directSlotsBySemanticKey: new Map(),
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
 * Direct slots prefer weak object identity and then a compact semantic key, so
 * filtering or reordering a recreated dynamic array does not shift progress.
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
  const claimedSlots = new Set<ActionBattleAiCompletionSlot>();
  const intentOccurrences = new WeakMap<ActionBattleAiIntent, number>();
  const semanticOccurrences = new Map<string, number>();

  for (const intent of intents) {
    if (!isDeferredIntent(intent)) {
      prepared.push(intent);
      continue;
    }

    deferred = true;
    const inheritedReceipt = executionReceipts.get(intent);
    const inheritedSlot = inheritedReceipt?.bindings[0]?.slot;
    let slot: ActionBattleAiCompletionSlot;
    if (inheritedSlot) {
      slot = getOrCreateInheritedSlot(state, inheritedSlot);
    } else {
      const intentOccurrence = getWeakOccurrence(intentOccurrences, intent);
      const semanticKey = getDirectIntentSemanticKey(intent);
      const semanticOccurrence = getMapOccurrence(
        semanticOccurrences,
        semanticKey
      );
      slot =
        selectMappedSlot(
          state.directSlotsByIntent.get(intent),
          intentOccurrence,
          claimedSlots
        ) ??
        selectMappedSlot(
          state.directSlotsBySemanticKey.get(semanticKey),
          semanticOccurrence,
          claimedSlots
        ) ??
        createSlot(state);
      rememberWeakMappedSlot(
        state.directSlotsByIntent,
        intent,
        intentOccurrence,
        slot
      );
      rememberMapMappedSlot(
        state.directSlotsBySemanticKey,
        semanticKey,
        semanticOccurrence,
        slot
      );
    }
    claimedSlots.add(slot);

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
