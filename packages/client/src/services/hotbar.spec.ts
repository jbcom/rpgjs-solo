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

  test("preserves activation order under out-of-order cleanup", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registerHotbarActivationHandler("layered", first);
    const unregisterSecond = registerHotbarActivationHandler("layered", second);
    const createContext = () => createHotbarInteractionContext({
      slot: {
        index: 0,
        id: "layered-action",
        type: "skill",
        name: "Layered Action",
        usable: true,
        entry: { type: "skill", id: "layered-action" },
        activation: { mode: "instant" as const, handler: "layered" },
      },
      setOptimisticSlot: vi.fn(),
      onInteraction: vi.fn(),
    });

    try {
      await activateHotbarSlot(createContext());
      expect(second).toHaveBeenCalledOnce();
      expect(first).not.toHaveBeenCalled();

      unregisterFirst();
      await activateHotbarSlot(createContext());
      expect(second).toHaveBeenCalledTimes(2);

      unregisterSecond();
      const fallbackContext = createContext();
      const fallbackUse = vi.spyOn(fallbackContext, "use");
      await activateHotbarSlot(fallbackContext);
      expect(second).toHaveBeenCalledTimes(2);
      expect(fallbackUse).toHaveBeenCalledOnce();
    } finally {
      unregisterSecond();
      unregisterFirst();
    }

    const third = vi.fn();
    const fourth = vi.fn();
    const unregisterThird = registerHotbarActivationHandler("layered", third);
    const unregisterFourth = registerHotbarActivationHandler("layered", fourth);
    try {
      unregisterFourth();
      await activateHotbarSlot(createContext());
      expect(third).toHaveBeenCalledOnce();
    } finally {
      unregisterFourth();
      unregisterThird();
    }
  });
});
