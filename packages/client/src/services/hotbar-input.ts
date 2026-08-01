interface HotbarInputEngine {
  acquireInputLock(owner?: object): () => void;
  isInputProcessingStopped(): boolean;
}

export interface HotbarGamepadSnapshot {
  wheelPressed: boolean;
  cancelPressed: boolean;
  previousPressed: boolean;
  nextPressed: boolean;
  usePressed: boolean;
  x: number;
  y: number;
}

interface HotbarGamepadInputCallbacks {
  getActiveSlot(): number;
  getVisibleSlotIndexes(): number[];
  activateSlot(index: number): void;
  selectAdjacentSlot(direction: -1 | 1): void;
  setWheelOpen(open: boolean): void;
  setWheelSlot(index: number): void;
}

/** Wrap a keyboard shortcut so modal input ownership always takes priority. */
export const createHotbarKeyboardShortcutHandler = (
  engine: Pick<HotbarInputEngine, "isInputProcessingStopped">,
  shortcut: () => void,
) => () => {
  if (engine.isInputProcessingStopped()) return false;
  shortcut();
  return true;
};

/**
 * Coordinate gamepad shortcut edges and the radial wheel's scoped input lock.
 * Once opened, the wheel remains responsible for releasing only its own lock
 * even though that lock makes `isInputProcessingStopped()` return true.
 */
export const createHotbarGamepadInputController = ({
  engine,
  callbacks,
  deadzone,
}: {
  engine: HotbarInputEngine;
  callbacks: HotbarGamepadInputCallbacks;
  deadzone: number;
}) => {
  const wheelInputOwner = {};
  let wheelOpen = false;
  let wasWheelPressed = false;
  let wasPreviousPressed = false;
  let wasNextPressed = false;
  let wasUsePressed = false;
  let cancelled = false;
  let releaseWheelInput: (() => void) | undefined;
  let wheelSlot = -1;

  const setWheelSlot = (slot: number) => {
    wheelSlot = slot;
    callbacks.setWheelSlot(slot);
  };

  const closeWheel = (activate: boolean) => {
    if (!wheelOpen) return;
    const slot = wheelSlot;
    wheelOpen = false;
    const releaseInput = releaseWheelInput;
    releaseWheelInput = undefined;
    releaseInput?.();
    callbacks.setWheelOpen(false);
    setWheelSlot(-1);
    if (
      activate
      && !cancelled
      && slot >= 0
      && !engine.isInputProcessingStopped()
    ) {
      callbacks.activateSlot(slot);
    }
    cancelled = false;
  };

  const poll = (gamepad: HotbarGamepadSnapshot) => {
    // Sample external ownership once. Do not use it to short-circuit an open
    // wheel, because the wheel's own lock also makes this method return true.
    const inputAvailable = !engine.isInputProcessingStopped();

    if (!wheelOpen && inputAvailable) {
      if (gamepad.previousPressed && !wasPreviousPressed) {
        callbacks.selectAdjacentSlot(-1);
      }
      if (gamepad.nextPressed && !wasNextPressed) {
        callbacks.selectAdjacentSlot(1);
      }
      if (gamepad.usePressed && !wasUsePressed) {
        const slot = callbacks.getActiveSlot();
        if (slot >= 0) callbacks.activateSlot(slot);
      }
      if (gamepad.wheelPressed && !wasWheelPressed) {
        releaseWheelInput = engine.acquireInputLock(wheelInputOwner);
        wheelOpen = true;
        callbacks.setWheelOpen(true);
        setWheelSlot(-1);
        cancelled = false;
      }
    }

    if (wheelOpen && gamepad.wheelPressed) {
      if (gamepad.cancelPressed) {
        cancelled = true;
        setWheelSlot(-1);
      } else {
        const magnitude = Math.sqrt(gamepad.x ** 2 + gamepad.y ** 2);
        if (magnitude < deadzone) {
          setWheelSlot(-1);
        } else {
          const visibleSlots = callbacks.getVisibleSlotIndexes();
          if (!visibleSlots.length) {
            setWheelSlot(-1);
          } else {
            const angle = (
              Math.atan2(gamepad.y, gamepad.x)
              + Math.PI / 2
              + Math.PI * 2
            ) % (Math.PI * 2);
            const sector = (Math.PI * 2) / visibleSlots.length;
            const visibleIndex = Math.floor((angle + sector / 2) / sector)
              % visibleSlots.length;
            setWheelSlot(visibleSlots[visibleIndex] ?? -1);
          }
        }
      }
    }

    if (!gamepad.wheelPressed && wasWheelPressed && wheelOpen) {
      closeWheel(true);
    }
    wasWheelPressed = gamepad.wheelPressed;
    wasPreviousPressed = gamepad.previousPressed;
    wasNextPressed = gamepad.nextPressed;
    wasUsePressed = gamepad.usePressed;
  };

  return {
    poll,
    destroy: () => closeWheel(false),
  };
};
