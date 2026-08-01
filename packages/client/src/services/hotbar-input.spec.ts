import { describe, expect, test, vi } from "vitest";
import {
  createHotbarGamepadInputController,
  createHotbarKeyboardShortcutHandler,
  type HotbarGamepadSnapshot,
} from "./hotbar-input";

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
  let externalLock = false;
  const engine = {
    stopProcessingInput: false,
    isInputProcessingStopped() {
      return externalLock || this.stopProcessingInput;
    },
    interruptCurrentPlayerMovement: vi.fn(),
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
    setExternalLock: (locked: boolean) => {
      externalLock = locked;
    },
  };
};

describe("hotbar input ownership", () => {
  test("blocks a keyboard number shortcut while input processing is stopped", () => {
    let locked = true;
    const activateNumberSlot = vi.fn();
    const keyDown = createHotbarKeyboardShortcutHandler(
      { isInputProcessingStopped: () => locked },
      activateNumberSlot,
    );

    expect(keyDown()).toBe(false);
    expect(activateNumberSlot).not.toHaveBeenCalled();

    locked = false;
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
    harness.setExternalLock(true);

    harness.controller.poll(held);
    expect(harness.callbacks.activateSlot).not.toHaveBeenCalled();
    expect(harness.callbacks.selectAdjacentSlot).not.toHaveBeenCalled();
    expect(harness.callbacks.setWheelOpen).not.toHaveBeenCalled();
    expect(harness.engine.stopProcessingInput).toBe(false);

    harness.setExternalLock(false);
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
    expect(harness.engine.stopProcessingInput).toBe(true);
    expect(harness.engine.interruptCurrentPlayerMovement).toHaveBeenCalledOnce();

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

  test("closes an opened wheel without activating when another owner takes input", () => {
    const harness = createGamepadHarness();

    harness.controller.poll({ ...releasedGamepad(), wheelPressed: true });
    harness.setExternalLock(true);
    harness.controller.poll({
      ...releasedGamepad(),
      wheelPressed: true,
      x: 1,
    });
    expect(harness.callbacks.setWheelSlot).toHaveBeenLastCalledWith(1);

    harness.controller.poll(releasedGamepad());
    expect(harness.callbacks.activateSlot).not.toHaveBeenCalled();
    expect(harness.callbacks.setWheelOpen).toHaveBeenLastCalledWith(false);
    expect(harness.engine.stopProcessingInput).toBe(false);
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
  });
});
