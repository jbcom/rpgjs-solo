import type {
  ActionBattleAnimationContext,
  ActionBattleAnimationEntity,
  ActionBattleAnimationKey,
  ActionBattleAnimationOptions,
} from "./types";

export const DEFAULT_DIE_ANIMATION_DELAY_MS = 500;

export interface ResolvedActionBattleAnimation {
  animationName: string;
  graphic?: string | string[];
  repeat: number;
  waitEnd: boolean;
  delayMs?: number;
}

export interface ActionBattleAnimationDefaults {
  animationName?: string;
  repeat?: number;
}

const DEFAULT_ANIMATION_BY_KEY: Record<ActionBattleAnimationKey, string> = {
  attack: "attack",
  hurt: "hurt",
  die: "die",
  castSkill: "skill",
};

export function resolveActionBattleAnimation(
  key: ActionBattleAnimationKey,
  entity: ActionBattleAnimationEntity,
  animations?: ActionBattleAnimationOptions,
  context?: ActionBattleAnimationContext,
  defaults: ActionBattleAnimationDefaults = {}
): ResolvedActionBattleAnimation | null {
  const defaultAnimationName =
    defaults.animationName ?? DEFAULT_ANIMATION_BY_KEY[key];
  const defaultRepeat = defaults.repeat ?? 1;
  const hasConfiguredAnimation = animations
    ? Object.prototype.hasOwnProperty.call(animations, key)
    : false;
  if (!hasConfiguredAnimation && key !== "attack") {
    return null;
  }

  const configured = hasConfiguredAnimation
    ? animations?.[key]
    : defaultAnimationName;
  const result =
    typeof configured === "function"
      ? configured(entity, context)
      : configured;

  if (result == null) return null;

  if (typeof result === "string") {
    return {
      animationName: result,
      repeat: defaultRepeat,
      waitEnd: false,
    };
  }

  const animationName = result.animationName ?? defaultAnimationName;
  return {
    animationName,
    graphic: result.graphic,
    repeat: result.repeat ?? defaultRepeat,
    waitEnd: result.waitEnd ?? false,
    delayMs: result.delayMs,
  };
}

export function playActionBattleAnimation(
  key: ActionBattleAnimationKey,
  entity: ActionBattleAnimationEntity,
  animations?: ActionBattleAnimationOptions,
  context?: ActionBattleAnimationContext,
  defaults: ActionBattleAnimationDefaults = {}
): ResolvedActionBattleAnimation | null {
  const animation = resolveActionBattleAnimation(
    key,
    entity,
    animations,
    context,
    defaults
  );
  if (!animation) return null;

  if (animation.graphic !== undefined) {
    entity.setGraphicAnimation(
      animation.animationName,
      animation.graphic,
      animation.repeat
    );
  } else {
    entity.setGraphicAnimation(animation.animationName, animation.repeat);
  }

  return animation;
}

export function getActionBattleAnimationRemovalDelay(
  animation: ResolvedActionBattleAnimation | null
): number {
  if (!animation) return 0;
  if (animation.delayMs !== undefined) return animation.delayMs;
  return animation.waitEnd ? DEFAULT_DIE_ANIMATION_DELAY_MS : 0;
}
