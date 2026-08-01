import { describe, expect, test, vi } from "vitest";
import {
  createHotbarGamepadInputController,
  createHotbarKeyboardShortcutHandler,
  type HotbarGamepadSnapshot,
} from "./hotbar-input";
import { ClientInputLockManager } from "./inputLock";

const releasedGamepad = (): HotbarGamepadSnapshot => ({
  wheelPressed: false,
  cancelPressed: false,
  previousPressed: false,
  nextPressed: false,
  usePressed: false,
  x: 0,
  y: 0,
});

const createGamepadHarness = () => {
  const inputLocks = new ClientInputLockManager();
  const interruptCurrentPlayerMovement = vi.fn();
  const engine = {
    stopProcessingInput: false,
    acquireInputLock: vi.fn((owner?: object) => {
      const release = inputLocks.acquire(owner);
      interruptCurrentPlayerMovement();
      return release;
    }),
    isInputProcessingStopped() {
      return this.stopProcessingInput || inputLocks.active;
    },
  };
  const callbacks = {
    getActiveSlot: vi.fn(() => 2),
    getVisibleSlotIndexes: vi.fn(() => [0, 1, 2, 3]),
    activateSlot: vi.fn(),
    selectAdjacentSlot: vi.fn(),
    setWheelOpen: vi.fn(),
    setWheelSlot: vi.fn(),
  };
  const controller = createHotbarGamepadInputController({
    engine,
    callbacks,
    deadzone: 0.35,
  });
  return {
    engine,
    callbacks,
    controller,
    interruptCurrentPlayerMovement,
    acquireExternalScopedLock: () => engine.acquireInputLock({}),
  };
};

describe("hotbar input ownership", () => {
  test("blocks keyboard shortcuts for scoped and legacy input owners", () => {
    const harness = createGamepadHarness();
    const activateNumberSlot = vi.fn();
    const keyDown = createHotbarKeyboardShortcutHandler(
      harness.engine,
      activateNumberSlot,
    );
    const releaseScopedLock = harness.acquireExternalScopedLock();

    expect(keyDown()).toBe(false);
    expect(activateNumberSlot).not.toHaveBeenCalled();

    releaseScopedLock();
    harness.engine.stopProcessingInput = true;
    expect(keyDown()).toBe(false);
    expect(activateNumberSlot).not.toHaveBeenCalled();

    harness.engine.stopProcessingInput = false;
    expect(keyDown()).toBe(true);
    expect(activateNumberSlot).toHaveBeenCalledOnce();
  });

  test("blocks gamepad shortcuts and wheel opening without deferring held edges", () => {
    const harness = createGamepadHarness();
    const held = {
      ...releasedGamepad(),
      wheelPressed: true,
      previousPressed: true,
      usePressed: true,
    };
    const releaseExternalLock = harness.acquireExternalScopedLock();

    harness.controller.poll(held);
    expect(harness.callbacks.activateSlot).not.toHaveBeenCalled();
    expect(harness.callbacks.selectAdjacentSlot).not.toHaveBeenCalled();
    expect(harness.callbacks.setWheelOpen).not.toHaveBeenCalled();
    expect(harness.engine.stopProcessingInput).toBe(false);

    releaseExternalLock();
    harness.controller.poll(held);
    expect(harness.callbacks.activateSlot).not.toHaveBeenCalled();
    expect(harness.callbacks.selectAdjacentSlot).not.toHaveBeenCalled();
    expect(harness.callbacks.setWheelOpen).not.toHaveBeenCalled();
  });

  test("polls normal unlocked gamepad shortcut edges", () => {
    const harness = createGamepadHarness();

    harness.controller.poll({
      ...releasedGamepad(),
      previousPressed: true,
      usePressed: true,
    });

    expect(harness.callbacks.selectAdjacentSlot).toHaveBeenCalledWith(-1);
    expect(harness.callbacks.activateSlot).toHaveBeenCalledWith(2);
  });

  test("uses a selected wheel slot after releasing its own lock", () => {
    const harness = createGamepadHarness();

    harness.controller.poll({ ...releasedGamepad(), wheelPressed: true });
    expect(harness.callbacks.setWheelOpen).toHaveBeenCalledWith(true);
    expect(harness.engine.stopProcessingInput).toBe(false);
    expect(harness.engine.isInputProcessingStopped()).toBe(true);
    expect(harness.interruptCurrentPlayerMovement).toHaveBeenCalledOnce();

    harness.controller.poll({
      ...releasedGamepad(),
      wheelPressed: true,
      x: 1,
    });
    expect(harness.callbacks.setWheelSlot).toHaveBeenLastCalledWith(1);

    harness.controller.poll(releasedGamepad());
    expect(harness.callbacks.activateSlot).toHaveBeenCalledWith(1);
    expect(harness.callbacks.setWheelOpen).toHaveBeenLastCalledWith(false);
    expect(harness.engine.stopProcessingInput).toBe(false);
  });

  test("preserves a scoped owner that takes input while the wheel is open", () => {
    const harness = createGamepadHarness();

    harness.controller.poll({ ...releasedGamepad(), wheelPressed: true });
    const releaseExternalLock = harness.acquireExternalScopedLock();
    harness.controller.poll({
      ...releasedGamepad(),
      wheelPressed: true,
      x: 1,
    });
    expect(harness.callbacks.setWheelSlot).toHaveBeenLastCalledWith(1);

    harness.controller.poll(releasedGamepad());
    expect(harness.callbacks.activateSlot).not.toHaveBeenCalled();
    expect(harness.callbacks.setWheelOpen).toHaveBeenLastCalledWith(false);
    expect(harness.engine.isInputProcessingStopped()).toBe(true);
    expect(harness.engine.stopProcessingInput).toBe(false);

    releaseExternalLock();
    expect(harness.engine.isInputProcessingStopped()).toBe(false);
  });

  test("preserves a legacy owner that takes input while the wheel is open", () => {
    const harness = createGamepadHarness();

    harness.controller.poll({ ...releasedGamepad(), wheelPressed: true });
    harness.controller.poll({
      ...releasedGamepad(),
      wheelPressed: true,
      x: 1,
    });
    harness.engine.stopProcessingInput = true;

    harness.controller.poll(releasedGamepad());
    expect(harness.callbacks.activateSlot).not.toHaveBeenCalled();
    expect(harness.callbacks.setWheelOpen).toHaveBeenLastCalledWith(false);
    expect(harness.engine.stopProcessingInput).toBe(true);
    expect(harness.engine.isInputProcessingStopped()).toBe(true);
  });

  test("cancels and closes an opened wheel while its own input lock is active", () => {
    const harness = createGamepadHarness();

    harness.controller.poll({ ...releasedGamepad(), wheelPressed: true });
    harness.controller.poll({
      ...releasedGamepad(),
      wheelPressed: true,
      cancelPressed: true,
      x: 1,
    });
    expect(harness.callbacks.setWheelSlot).toHaveBeenLastCalledWith(-1);

    harness.controller.poll(releasedGamepad());
    expect(harness.callbacks.activateSlot).not.toHaveBeenCalled();
    expect(harness.callbacks.setWheelOpen).toHaveBeenLastCalledWith(false);
    expect(harness.engine.stopProcessingInput).toBe(false);
    expect(harness.engine.isInputProcessingStopped()).toBe(false);
  });

  test("destroy releases only the wheel lock without activating", () => {
    const harness = createGamepadHarness();

    harness.controller.poll({ ...releasedGamepad(), wheelPressed: true });
    const releaseExternalLock = harness.acquireExternalScopedLock();
    harness.controller.destroy();

    expect(harness.callbacks.activateSlot).not.toHaveBeenCalled();
    expect(harness.callbacks.setWheelOpen).toHaveBeenLastCalledWith(false);
    expect(harness.engine.isInputProcessingStopped()).toBe(true);

    releaseExternalLock();
    expect(harness.engine.isInputProcessingStopped()).toBe(false);
  });
});
