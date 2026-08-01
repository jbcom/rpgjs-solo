import { describe, expect, test, vi } from "vitest";
import {
  activateHotbarSlot,
  createHotbarInteractionContext,
  registerHotbarActivationHandler,
  shouldClearHotbarOptimisticSlot,
} from "./hotbar";

describe("hotbar activation authority", () => {
  test("persists a targeted slot before a canceled targeting handler returns", async () => {
    const setOptimisticSlot = vi.fn();
    const onInteraction = vi.fn();
    const unregister = registerHotbarActivationHandler(
      "targeting.cancel",
      () => true,
    );
    const slot = {
      index: 2,
      id: "aimed-shot",
      type: "skill",
      name: "Aimed Shot",
      usable: true,
      entry: { type: "skill", id: "aimed-shot" },
      activation: { mode: "target" as const, handler: "targeting.cancel" },
    };

    try {
      await activateHotbarSlot(createHotbarInteractionContext({
        slot,
        setOptimisticSlot,
        onInteraction,
      }));

      expect(setOptimisticSlot).toHaveBeenCalledWith(2);
      expect(onInteraction).toHaveBeenCalledTimes(1);
      expect(onInteraction).toHaveBeenCalledWith("selectSlot", { slot: 2 });
      expect(onInteraction).not.toHaveBeenCalledWith(
        "useSlot",
        expect.anything(),
      );
    } finally {
      unregister();
    }
  });

  test("preserves select and instant activation interaction semantics", async () => {
    const setOptimisticSlot = vi.fn();
    const onInteraction = vi.fn();
    const base = {
      id: "potion",
      type: "item",
      name: "Potion",
      usable: true,
      entry: { type: "item", id: "potion" },
    };

    await activateHotbarSlot(createHotbarInteractionContext({
      slot: { ...base, index: 0, activation: { mode: "select" } },
      setOptimisticSlot,
      onInteraction,
    }));
    expect(onInteraction).toHaveBeenLastCalledWith("selectSlot", { slot: 0 });

    onInteraction.mockClear();
    await activateHotbarSlot(createHotbarInteractionContext({
      slot: { ...base, index: 1, activation: { mode: "instant" } },
      setOptimisticSlot,
      onInteraction,
    }));
    expect(onInteraction).toHaveBeenCalledTimes(1);
    expect(onInteraction).toHaveBeenCalledWith("useSlot", {
      slot: 1,
      target: undefined,
    });
  });

  test("clears optimism on authoritative acknowledgement or rejection", () => {
    expect(shouldClearHotbarOptimisticSlot({
      optimisticSlot: 2,
      serverActiveSlot: 2,
    })).toBe(true);
    expect(shouldClearHotbarOptimisticSlot({
      optimisticSlot: 2,
      serverActiveSlot: 1,
      feedback: { slot: 2, status: "rejected" },
    })).toBe(true);
    expect(shouldClearHotbarOptimisticSlot({
      optimisticSlot: 2,
      serverActiveSlot: 1,
      feedback: { slot: 2, status: "selected" },
    })).toBe(false);
  });
});
