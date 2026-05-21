import type {
  ActionBattleAnimationKey,
  ActionBattleVisualComposer,
  ActionBattleVisualContext,
  ActionBattleVisualHelpers,
  ActionBattleVisualInput,
  ActionBattleVisualPart,
} from "./types";
import { getActionBattleOptions } from "./config";
import { playActionBattleAnimation } from "./animations";

type PreviewStarter = (
  entity: any,
  options?: Record<string, any>
) => void;

let previewStarter: PreviewStarter | undefined;

export const ACTION_BATTLE_HIT_FX_COMPONENT_ID = "action-battle-hit-fx";

export function setActionBattlePreviewStarter(starter?: PreviewStarter) {
  previewStarter = starter;
}

const callGraphic = (
  entity: any,
  keyOrOptions: ActionBattleAnimationKey | any,
  context?: ActionBattleVisualContext
) => {
  if (!entity || keyOrOptions == null) return;

  if (typeof keyOrOptions === "string") {
    playActionBattleAnimation(
      keyOrOptions as ActionBattleAnimationKey,
      entity,
      context?.animations ?? getActionBattleOptions().animations,
      {
        attacker: context?.attacker,
        target: context?.target,
        skill: context?.skill,
      },
      context?.animationDefaults
    );
    return;
  }

  const animationName = keyOrOptions.animationName;
  if (!animationName) return;
  const repeat = keyOrOptions.repeat ?? 1;
  const graphic = keyOrOptions.graphic;
  if (typeof entity.setGraphicAnimation === "function") {
    if (graphic !== undefined) {
      entity.setGraphicAnimation(animationName, graphic, repeat);
    } else {
      entity.setGraphicAnimation(animationName, repeat);
    }
    return;
  }
  if (typeof entity.setAnimation === "function") {
    if (graphic !== undefined) {
      entity.setAnimation(animationName, graphic, repeat);
    } else {
      entity.setAnimation(animationName, repeat);
    }
  }
};

const createHelpers = (context: ActionBattleVisualContext): ActionBattleVisualHelpers => ({
  graphic(entity, keyOrOptions) {
    callGraphic(entity, keyOrOptions, context);
  },
  flash(entity, options = {}) {
    entity?.flash?.({
      type: "tint",
      tint: "red",
      duration: 200,
      cycles: 1,
      ...options,
    });
  },
  damageText(entity, damageOrText) {
    if (!entity?.showHit) return;
    if (typeof damageOrText === "string") {
      entity.showHit(damageOrText);
      return;
    }
    const damage = damageOrText ?? context.damage ?? context.result?.damage;
    if (damage === undefined) return;
    entity.showHit(`-${damage}`);
  },
  component(entity, id, params = {}) {
    entity?.showComponentAnimation?.(id, params);
  },
  preview(entity, options = {}) {
    previewStarter?.(entity, options);
  },
});

const classicParts: Partial<Record<ActionBattleVisualContext["moment"], ActionBattleVisualPart>> = {
  attack({ entity }, fx) {
    fx.graphic(entity, "attack");
  },
  castSkill({ entity }, fx) {
    fx.graphic(entity, "castSkill");
  },
  preview({ entity }, fx) {
    fx.preview(entity);
  },
  hit({ target, damage }, fx) {
    fx.flash(target);
    fx.damageText(target, damage);
  },
  hurt({ entity, target }, fx) {
    const hurtTarget = target ?? entity;
    fx.flash(hurtTarget);
    fx.damageText(hurtTarget);
    fx.graphic(hurtTarget, "hurt");
  },
  defeat({ entity, target }, fx) {
    fx.graphic(target ?? entity, "die");
  },
};

const fxParts: Partial<Record<ActionBattleVisualContext["moment"], ActionBattleVisualPart>> = {
  ...classicParts,
  hit(context, fx) {
    classicParts.hit?.(context, fx);
    fx.component(context.target, ACTION_BATTLE_HIT_FX_COMPONENT_ID, {
      name: "hitSpark",
      scale: 0.8,
      zIndex: 1000,
    });
  },
  hurt(context, fx) {
    classicParts.hurt?.(context, fx);
    fx.component(context.target ?? context.entity, ACTION_BATTLE_HIT_FX_COMPONENT_ID, {
      name: "hitSpark",
      scale: 0.8,
      zIndex: 1000,
    });
  },
};

const resolveParts = (
  input: ActionBattleVisualInput | undefined
): Partial<Record<ActionBattleVisualContext["moment"], ActionBattleVisualPart>> | null => {
  const visual = input ?? "classic";
  if (visual === "none") return null;
  if (visual === "classic") return classicParts;
  if (visual === "fx") return fxParts;
  if (typeof visual === "function") return null;
  return visual;
};

export function createActionBattleVisual(
  input: ActionBattleVisualInput = "classic"
): ActionBattleVisualComposer {
  if (typeof input === "function") {
    return input;
  }
  const parts = resolveParts(input);
  const composer: ActionBattleVisualComposer = (context) => {
    if (!parts) return;
    const part = parts[context.moment];
    if (!part) return;
    part(context, createHelpers(context));
  };
  (composer as any).__actionBattleUsesFx = input === "fx";
  return composer;
}

export const createClassicActionBattleVisual = () =>
  createActionBattleVisual("classic");

export const createFxActionBattleVisual = () =>
  createActionBattleVisual("fx");

export function playActionBattleVisual(
  visual: ActionBattleVisualInput | ActionBattleVisualComposer | undefined,
  context: ActionBattleVisualContext
) {
  const composer =
    typeof visual === "function" ? visual : createActionBattleVisual(visual);
  composer(context);
}

export function usesActionBattleFxVisual(visual: ActionBattleVisualInput | undefined): boolean {
  return visual === "fx" || Boolean((visual as any)?.__actionBattleUsesFx);
}
