import type { ActionBattleAiIntent } from "./ai-behavior-tree";

interface ActionBattleAiCompletionSlot {
  acknowledged: boolean;
  consumes: boolean;
  inFlight: boolean;
}

interface ActionBattleAiCompletionState {
  completed: boolean;
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

interface ActionBattleAiPendingExecution {
  cancelled: boolean;
  intent: ActionBattleAiIntent;
  receipt: ActionBattleAiIntentReceipt;
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
const preparedReceiptEnvelopes = new WeakSet<ActionBattleAiIntent>();
const pendingReceiptsByExecutor = new Map<
  object,
  Set<ActionBattleAiPendingExecution>
>();
const referencedValueIds = new WeakMap<object, number>();
const referencedSymbolIds = new WeakMap<symbol, number>();
let referencedValueId = 0;
const STRUCTURAL_KEY_MAX_DEPTH = 128;

const createSlot = (
  state: ActionBattleAiCompletionState,
  consumes: boolean
): ActionBattleAiCompletionSlot => {
  const slot = { acknowledged: false, consumes, inFlight: false };
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

const getReferencedSymbolId = (value: symbol): number => {
  const existing = referencedSymbolIds.get(value);
  if (existing !== undefined) return existing;
  const id = referencedValueId++;
  referencedSymbolIds.set(value, id);
  return id;
};

const encodeSymbolKey = (value: symbol): ActionBattleAiKeyValue => {
  const globalKey = Symbol.keyFor(value);
  return globalKey === undefined
    ? ["symbol-key", getReferencedSymbolId(value)]
    : ["global-symbol-key", globalKey];
};

type ActionBattleAiKeyValue =
  | string
  | number
  | boolean
  | null
  | ActionBattleAiKeyValue[];

const encodePrimitiveValue = (value: unknown): ActionBattleAiKeyValue => {
  if (value === null) return ["null"];
  switch (typeof value) {
    case "undefined":
      return ["undefined"];
    case "string":
      return ["string", value];
    case "boolean":
      return ["boolean", value];
    case "number":
      if (Number.isNaN(value)) return ["number", "NaN"];
      if (value === Infinity) return ["number", "Infinity"];
      if (value === -Infinity) return ["number", "-Infinity"];
      if (Object.is(value, -0)) return ["number", "-0"];
      return ["number", String(value)];
    case "bigint":
      return ["bigint", String(value)];
    case "symbol": {
      const globalKey = Symbol.keyFor(value);
      return globalKey === undefined
        ? ["symbol-reference", getReferencedSymbolId(value)]
        : ["global-symbol", globalKey];
    }
    default:
      return ["unsupported-primitive", typeof value];
  }
};

const stringifyKeyValue = (value: ActionBattleAiKeyValue): string =>
  JSON.stringify(value);

const encodeDataDescriptor = (
  descriptor: PropertyDescriptor,
  value: ActionBattleAiKeyValue
): ActionBattleAiKeyValue => [
  "data-property",
  descriptor.enumerable === true,
  descriptor.configurable === true,
  descriptor.writable === true,
  value,
];

const getOwnDataId = (value: object): unknown => {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "id");
    if (!descriptor || !("value" in descriptor)) return undefined;
    const id = descriptor.value;
    return ["string", "number", "boolean", "bigint"].includes(typeof id)
      ? id
      : undefined;
  } catch {
    return undefined;
  }
};

const getStableValueKey = (value: unknown): string => {
  if (typeof value === "symbol") {
    return stringifyKeyValue(encodePrimitiveValue(value));
  }
  if (typeof value !== "object" && typeof value !== "function") {
    return stringifyKeyValue(encodePrimitiveValue(value));
  }
  if (value === null) return stringifyKeyValue(encodePrimitiveValue(value));
  const explicitId = getOwnDataId(value);
  if (explicitId !== undefined) {
    return stringifyKeyValue(["id", encodePrimitiveValue(explicitId)]);
  }
  return stringifyKeyValue(["reference", getReferencedValueId(value)]);
};

const encodeStructuralValue = (
  value: unknown,
  paths = new Map<object, string>(),
  path = "$",
  depth = 0
): ActionBattleAiKeyValue => {
  if (typeof value === "symbol") return encodePrimitiveValue(value);
  if (typeof value !== "object" && typeof value !== "function") {
    return encodePrimitiveValue(value);
  }
  if (value === null) return encodePrimitiveValue(value);
  if (depth > STRUCTURAL_KEY_MAX_DEPTH) {
    return ["reference", getReferencedValueId(value)];
  }

  const existingPath = paths.get(value);
  if (existingPath !== undefined) return ["back-reference", existingPath];

  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  let extensible: boolean;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    extensible = Object.isExtensible(value);
  } catch {
    return ["reference", getReferencedValueId(value)];
  }

  const isArray = Array.isArray(value);
  if (isArray && prototype !== Array.prototype) {
    return ["stable", getStableValueKey(value)];
  }
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    return ["stable", getStableValueKey(value)];
  }

  const lengthDescriptor = isArray ? descriptors.length : undefined;
  if (
    isArray &&
    (!lengthDescriptor ||
      !("value" in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0)
  ) {
    return ["reference", getReferencedValueId(value)];
  }

  const ownKeys = Reflect.ownKeys(descriptors)
    .filter((key) => !(isArray && key === "length"))
    .map((key) => ({
      key,
    }));

  if (
    ownKeys.some(({ key }) => {
      const descriptor = descriptors[key as keyof PropertyDescriptorMap];
      return !descriptor || !("value" in descriptor);
    })
  ) {
    return ["reference", getReferencedValueId(value)];
  }

  paths.set(value, path);
  const entries: ActionBattleAiKeyValue[] = ownKeys.map(({ key }, index) => {
    const descriptor = descriptors[key as keyof PropertyDescriptorMap]!;
    const encodedKey: ActionBattleAiKeyValue =
      typeof key === "string"
        ? ["string-key", key]
        : encodeSymbolKey(key);
    return [
      encodedKey,
      encodeDataDescriptor(
        descriptor,
        encodeStructuralValue(
          descriptor.value,
          paths,
          `${path}/${index}`,
          depth + 1
        )
      ),
    ];
  });
  return isArray
    ? [
        "array",
        encodeDataDescriptor(
          lengthDescriptor!,
          encodePrimitiveValue(lengthDescriptor!.value)
        ),
        ["extensible", extensible],
        entries,
      ]
    : [
        prototype === null ? "null-record" : "record",
        ["extensible", extensible],
        entries,
      ];
};

const getStructuralValueKey = (value: unknown): string => {
  try {
    return stringifyKeyValue(encodeStructuralValue(value));
  } catch {
    return getStableValueKey(value);
  }
};

const composeSemanticKey = (
  ...parts: ActionBattleAiKeyValue[]
): string => stringifyKeyValue(parts);

const getDirectIntentSemanticKey = (
  intent: ActionBattleAiIntent
): string => {
  if (intent.receiptKey !== undefined) {
    return composeSemanticKey(
      "authored-receipt",
      encodePrimitiveValue(intent.receiptKey)
    );
  }
  // Consumption controls tree handling after execution, not receipt identity.
  switch (intent.type) {
    case "idle":
    case "patrol":
    case "faceTarget":
    case "moveToTarget":
    case "fleeFromTarget":
    case "holdPosition":
      return composeSemanticKey(intent.type);
    case "keepDistance":
      return composeSemanticKey(
        intent.type,
        getStableValueKey(intent.distance),
        getStableValueKey(intent.tolerance)
      );
    case "useAttack":
      return composeSemanticKey(intent.type, getStableValueKey(intent.pattern));
    case "useSkill":
      return composeSemanticKey(intent.type, getStableValueKey(intent.skill));
    case "setMode":
      return composeSemanticKey(intent.type, intent.mode);
    case "run":
      return composeSemanticKey(intent.type, getStableValueKey(intent.callback));
    case "visual":
      return composeSemanticKey(intent.type, getStructuralValueKey(intent.visual));
    case "setSpeed":
      return composeSemanticKey(intent.type, getStableValueKey(intent.value));
    case "moveToPoint":
    case "teleportTo":
      return composeSemanticKey(
        intent.type,
        getStableValueKey(intent.position.x),
        getStableValueKey(intent.position.y)
      );
    case "teleportNearTarget":
      return composeSemanticKey(
        intent.type,
        getStableValueKey(intent.options.distance),
        getStableValueKey(intent.options.angleDegrees)
      );
    case "callAction":
      return composeSemanticKey(
        intent.type,
        intent.name,
        getStructuralValueKey(intent.payload)
      );
  }
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
  if (existing) {
    existing.consumes = inherited.consumes;
    return existing;
  }
  const slot = createSlot(state, inherited.consumes);
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

/** Whether unresolved work in one completion should consume the AI tick. */
export const getActionBattleAiIntentCompletionPendingConsume = (
  completion: ActionBattleAiIntentCompletion
): boolean =>
  completionStates
    .get(completion)
    ?.slots.some((slot) => !slot.acknowledged && slot.consumes) ?? true;

/**
 * Clone intents into one-use execution envelopes.
 *
 * Receipt metadata lives only in this module's WeakMaps. Nested `once()`
 * nodes inherit the inner slot identity, allowing every owner to acknowledge
 * the same authoritative execution without changing the public intent shape.
 * Direct slots use a collision-free semantic key, so filtering, reordering,
 * recreation, or mutation of an authored envelope cannot shift progress.
 * Every intent is receipted because movement, callbacks, teleports, and combat
 * can all be rejected by the authoritative executor after tree evaluation.
 */
export const prepareActionBattleAiIntentCompletion = (
  input: ActionBattleAiIntent | ActionBattleAiIntent[],
  completion: ActionBattleAiIntentCompletion
): {
  deferred: boolean;
  waiting: boolean;
  waitingConsumes: boolean;
  intent: ActionBattleAiIntent | ActionBattleAiIntent[];
} => {
  const state = completionStates.get(completion);
  if (!state) {
    return {
      deferred: false,
      waiting: false,
      waitingConsumes: true,
      intent: input,
    };
  }

  const intents = Array.isArray(input) ? input : [input];
  const prepared: ActionBattleAiIntent[] = [];
  let deferred = state.slots.some((slot) => !slot.acknowledged);
  const claimedSlots = new Set<ActionBattleAiCompletionSlot>();
  const semanticOccurrences = new Map<string, number>();
  const directSemanticKeys = new Set<string>();
  const inheritedSlots = new Set<ActionBattleAiCompletionSlot>();

  for (const intent of intents) {
    const inheritedReceipt = executionReceipts.get(intent);
    if (!inheritedReceipt && preparedReceiptEnvelopes.has(intent)) {
      throw new Error(
        "A settled one-use envelope cannot be authorized by another once() node. Request a fresh envelope from its owner."
      );
    }
    const inheritedSlot = inheritedReceipt?.bindings[0]?.slot;
    if (inheritedSlot) {
      if (inheritedSlots.has(inheritedSlot)) {
        throw new Error(
          "A once() result cannot contain the same inherited one-shot action more than once."
        );
      }
      inheritedSlots.add(inheritedSlot);
      continue;
    }
    const semanticKey = getDirectIntentSemanticKey(intent);
    if (directSemanticKeys.has(semanticKey)) {
      throw new Error(
        "Dynamic once() siblings must have distinct semantics or unique stable receiptKey values."
      );
    }
    directSemanticKeys.add(semanticKey);
  }

  for (const intent of intents) {
    deferred = true;
    const inheritedReceipt = executionReceipts.get(intent);
    const inheritedSlot = inheritedReceipt?.bindings[0]?.slot;
    let slot: ActionBattleAiCompletionSlot;
    if (inheritedSlot) {
      slot = getOrCreateInheritedSlot(state, inheritedSlot);
    } else {
      const semanticKey = getDirectIntentSemanticKey(intent);
      const semanticOccurrence = getMapOccurrence(
        semanticOccurrences,
        semanticKey
      );
      slot =
        selectMappedSlot(
          state.directSlotsBySemanticKey.get(semanticKey),
          semanticOccurrence,
          claimedSlots
        ) ?? createSlot(state, intent.consume !== false);
      rememberMapMappedSlot(
        state.directSlotsBySemanticKey,
        semanticKey,
        semanticOccurrence,
        slot
      );
    }
    claimedSlots.add(slot);

    if (slot.acknowledged) continue;
    if (!inheritedSlot) slot.consumes = intent.consume !== false;
    if (slot.inFlight) continue;

    const envelope = { ...intent } as ActionBattleAiIntent;
    preparedReceiptEnvelopes.add(envelope);
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
    waiting:
      deferred &&
      prepared.length === 0 &&
      state.slots.some((slot) => !slot.acknowledged),
    waitingConsumes: state.slots.some(
      (slot) => !slot.acknowledged && slot.consumes
    ),
    // A dynamic scalar can temporarily resolve to an already-acknowledged
    // slot while another previously observed slot remains pending. Returning
    // the original scalar here would execute acknowledged work again without
    // a receipt. An empty intent list preserves progress until the pending
    // semantic action reappears.
    intent: Array.isArray(input) ? prepared : (prepared[0] ? prepared[0] : []),
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
  execute: () => boolean | Promise<boolean>
): boolean => {
  const receipt = executionReceipts.get(intent);
  if (!receipt) {
    if (preparedReceiptEnvelopes.has(intent)) return false;
    const executed = execute();
    if (typeof executed === "boolean") return executed;
    void Promise.resolve(executed).catch(() => false);
    return true;
  }
  if (
    receipt.bindings.some(
      ({ slot }) => slot.acknowledged || slot.inFlight
    )
  ) {
    executionReceipts.delete(intent);
    return false;
  }

  const pending = pendingReceiptsByExecutor.get(executor) ?? new Set();
  pendingReceiptsByExecutor.set(executor, pending);
  const execution: ActionBattleAiPendingExecution = {
    cancelled: false,
    intent,
    receipt,
  };
  pending.add(execution);
  for (const { slot } of receipt.bindings) slot.inFlight = true;
  let asyncScheduled = false;

  try {
    const executed = execute();
    if (typeof executed !== "boolean") {
      if (execution.cancelled) {
        void Promise.resolve(executed).catch(() => false);
        return false;
      }
      executionReceipts.delete(intent);
      asyncScheduled = true;
      void Promise.resolve(executed)
        .then((accepted) => {
          if (!execution.cancelled && accepted) acknowledgeReceipt(receipt);
        })
        .catch(() => false)
        .finally(() => {
          if (!execution.cancelled) {
            for (const { slot } of receipt.bindings) slot.inFlight = false;
          }
          pending.delete(execution);
          if (
            pending.size === 0 &&
            pendingReceiptsByExecutor.get(executor) === pending
          ) {
            pendingReceiptsByExecutor.delete(executor);
          }
        });
      return true;
    }
    if (execution.cancelled) return false;
    for (const { slot } of receipt.bindings) slot.inFlight = false;
    if (executed) acknowledgeReceipt(receipt);
    return executed;
  } catch (error) {
    if (!execution.cancelled) {
      for (const { slot } of receipt.bindings) slot.inFlight = false;
    }
    throw error;
  } finally {
    if (!asyncScheduled) {
      pending.delete(execution);
      executionReceipts.delete(intent);
    }
    if (
      pending.size === 0 &&
      pendingReceiptsByExecutor.get(executor) === pending
    ) {
      pendingReceiptsByExecutor.delete(executor);
    }
  }
};

/** Abandon every currently executing receipt owned by an executor. */
export const cancelActionBattleAiIntentExecutions = (executor: object): void => {
  const pending = pendingReceiptsByExecutor.get(executor);
  if (!pending) return;
  for (const execution of pending) {
    execution.cancelled = true;
    for (const { slot } of execution.receipt.bindings) slot.inFlight = false;
    executionReceipts.delete(execution.intent);
  }
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
