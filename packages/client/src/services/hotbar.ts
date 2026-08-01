import type { HotbarEntry, HotbarEntryPresentation } from "@rpgjs/common";

/** Client-ready slot data received by a custom hotbar component or handler. */
export interface HotbarClientSlot extends HotbarEntryPresentation {
  /** Zero-based persistent slot index. */
  index: number;
  /** Serializable authoritative entry reference. */
  entry: HotbarEntry;
  /** Whether the slot is outside the player's current capacity. */
  locked?: boolean;
  /** Optional player-visible explanation for unlocking the slot. */
  lockedHint?: string;
}

/**
 * Operations exposed to a client activation handler.
 *
 * `select()` and `use()` send interactions back to the authoritative server;
 * handlers must not apply gameplay state directly on the client.
 */
export interface HotbarActivationContext {
  /** Slot being activated. */
  slot: HotbarClientSlot;
  /** Select the slot without using its entry. */
  select(): void;
  /** Ask the server to use the entry with optional serializable target data. */
  use(target?: unknown): void;
}

/** Client preparation callback for a serialized activation handler id. */
export type HotbarActivationHandler = (
  context: HotbarActivationContext,
) => boolean | void | Promise<boolean | void>;

/** Server interaction names emitted by the built-in hotbar component. */
export type HotbarInteractionName = "selectSlot" | "useSlot";

/** Payload sent through the built-in hotbar GUI interaction channel. */
export interface HotbarInteractionPayload {
  slot: number;
  target?: unknown;
}

/** Build one ingress context for optimistic UI and authoritative server state. */
export function createHotbarInteractionContext({
  slot,
  setOptimisticSlot,
  onInteraction,
}: {
  slot: HotbarClientSlot;
  setOptimisticSlot: (slot: number) => void;
  onInteraction?: (
    name: HotbarInteractionName,
    payload: HotbarInteractionPayload,
  ) => void;
}): HotbarActivationContext {
  return {
    slot,
    select() {
      setOptimisticSlot(slot.index);
      if (
        slot.activation?.mode === "select"
        || slot.activation?.mode === "target"
      ) {
        onInteraction?.("selectSlot", { slot: slot.index });
      }
    },
    use(target) {
      onInteraction?.("useSlot", { slot: slot.index, target });
    },
  };
}

/** Decide whether authoritative feedback has settled an optimistic selection. */
export function shouldClearHotbarOptimisticSlot({
  optimisticSlot,
  serverActiveSlot,
  feedback,
}: {
  optimisticSlot: number | null;
  serverActiveSlot?: number | null;
  feedback?: { slot?: number; status?: string };
}): boolean {
  if (optimisticSlot === null) return false;
  return (
    serverActiveSlot !== null
    && serverActiveSlot !== undefined
    && Number(serverActiveSlot) === optimisticSlot
  ) || (
    feedback?.slot === optimisticSlot
    && feedback.status === "rejected"
  );
}

const activationHandlers = new Map<string, HotbarActivationHandler>();
const activationHandlerRegistrations = new Map<
  string,
  {
    base: HotbarActivationHandler | undefined;
    entries: Array<{
      handler: HotbarActivationHandler;
      active: boolean;
    }>;
  }
>();

/**
 * Register a client preparation handler for a serialized hotbar activation id.
 *
 * Targeting modules can use this to prepare a target and call `context.use()`
 * without coupling the generic hotbar component to their gameplay rules.
 *
 * @param id - Serialized handler id emitted by the server presentation.
 * @param handler - Client-only preparation callback.
 * @returns An idempotent cleanup function that restores the newest
 * still-active handler for the same id.
 *
 * @example
 * ```ts
 * const unregister = registerHotbarActivationHandler("pick-crop", ({ use }) => {
 *   use({ eventId: "crop-12" });
 * });
 * ```
 */
export function registerHotbarActivationHandler(
  id: string,
  handler: HotbarActivationHandler,
): () => void {
  const registrations = activationHandlerRegistrations.get(id) ?? {
    base: activationHandlers.get(id),
    entries: [],
  };
  activationHandlerRegistrations.set(id, registrations);
  const registration = { handler, active: true };
  registrations.entries.push(registration);
  activationHandlers.set(id, handler);
  return () => {
    if (!registration.active) return;
    registration.active = false;
    const index = registrations.entries.indexOf(registration);
    if (index >= 0) registrations.entries.splice(index, 1);

    const current =
      registrations.entries[registrations.entries.length - 1]?.handler;
    if (current) activationHandlers.set(id, current);
    else if (registrations.base) {
      activationHandlers.set(id, registrations.base);
      activationHandlerRegistrations.delete(id);
    } else {
      activationHandlers.delete(id);
      activationHandlerRegistrations.delete(id);
    }
  };
}

/**
 * Activate a client slot according to its serialized activation metadata.
 *
 * Locked and unusable slots are ignored. Unknown handlers fall back to the
 * normal authoritative `useSlot` interaction.
 *
 * @param context - Slot data and server interaction callbacks.
 * @returns A promise resolved after client preparation has completed.
 */
export async function activateHotbarSlot(
  context: HotbarActivationContext,
): Promise<void> {
  const { slot } = context;
  if (slot.locked || slot.usable === false) return;

  context.select();
  if (slot.activation?.mode === "select") return;

  const handlerId = slot.activation?.handler;
  const handler = handlerId ? activationHandlers.get(handlerId) : undefined;
  if (handler) {
    const handled = await handler(context);
    if (handled !== false) return;
  }
  context.use();
}
