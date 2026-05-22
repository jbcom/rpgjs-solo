type LocomotionEntity = {
  animationFixed?: boolean;
  setGraphicAnimation?: (...args: any[]) => unknown;
  animationName?: {
    set?: (animationName: string) => unknown;
  };
  resetAnimationState?: () => unknown;
};

export const withActionBattleAnimationUnlocked = <T>(
  entity: LocomotionEntity | undefined,
  callback: () => T
): T => {
  if (!entity) return callback();

  const previousAnimationFixed = entity.animationFixed;
  entity.animationFixed = false;

  try {
    return callback();
  } finally {
    entity.animationFixed = previousAnimationFixed;
  }
};

/**
 * Force a locomotion animation even when an action lock temporarily froze
 * animation changes. This keeps server state and local rendering coherent
 * after attack recovery interrupts movement.
 */
export const forceActionBattleLocomotionAnimation = (
  entity: LocomotionEntity | undefined,
  animationName: "stand" | "walk"
) => {
  if (!entity) return;

  withActionBattleAnimationUnlocked(entity, () => {
    if (typeof entity.resetAnimationState === "function") {
      entity.resetAnimationState();
    }

    if (typeof entity.setGraphicAnimation === "function") {
      entity.setGraphicAnimation(animationName);
    } else if (typeof entity.animationName?.set === "function") {
      entity.animationName.set(animationName);
    }
  });
};
