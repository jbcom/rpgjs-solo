export type StudioCombatAnimationIds = {
  attack?: string;
  hurt?: string;
  die?: string;
  castSkill?: string;
  castSpell?: string;
};

export type StudioCombatAnimationOptions = {
  animationName?: string;
  repeat?: number;
  dieDelayMs?: number;
};

type ActionBattleAnimationOptions = Partial<
  Record<
    "attack" | "hurt" | "die" | "castSkill",
    ActionBattleAnimationResult | ActionBattleAnimationResolver
  >
>;

type ActionBattleAnimationEntity = {
  [key: string]: any;
};

type ActionBattleAnimationResult = {
  animationName?: string;
  graphic?: string | string[];
  repeat?: number;
  waitEnd?: boolean;
  delayMs?: number;
} | null | undefined;

type ActionBattleAnimationResolver = (
  entity: ActionBattleAnimationEntity,
) => ActionBattleAnimationResult;

const hasGraphic = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const resolveStudioAnimationsFromEntity = (
  entity: ActionBattleAnimationEntity,
): StudioCombatAnimationIds => {
  return (
    entity.studioCombatAnimations ??
    entity.combatAnimations ??
    entity.animations ??
    {}
  );
};

const createAnimationResult = (
  graphic: unknown,
  animationName: string,
  repeat: number,
  delayMs?: number,
): ActionBattleAnimationResult => {
  if (!hasGraphic(graphic)) return null;
  return {
    animationName,
    graphic,
    repeat,
    ...(delayMs !== undefined ? { delayMs } : {}),
  };
};

/**
 * Convert RPGJS Studio combat animation media ids into action-battle animation
 * options. Studio generated combat spritesheets use the character spritesheet
 * preset, so the playable animation is usually `walk` on the temporary graphic.
 *
 * Without a static `animations` object, the returned resolvers read
 * `entity.studioCombatAnimations`, `entity.combatAnimations`, or
 * `entity.animations` at play time. This lets Studio project data fetched at
 * runtime drive player animations.
 */
export const createStudioActionBattleAnimations = (
  animations?: StudioCombatAnimationIds,
  options: StudioCombatAnimationOptions = {},
): ActionBattleAnimationOptions => {
  const animationName = options.animationName ?? "walk";
  const repeat = options.repeat ?? 1;
  const dieDelayMs = options.dieDelayMs ?? 500;

  if (!animations) {
    return {
      attack: (entity) => {
        const current = resolveStudioAnimationsFromEntity(entity);
        return createAnimationResult(current.attack, animationName, repeat);
      },
      hurt: (entity) => {
        const current = resolveStudioAnimationsFromEntity(entity);
        return createAnimationResult(current.hurt, animationName, repeat);
      },
      die: (entity) => {
        const current = resolveStudioAnimationsFromEntity(entity);
        return createAnimationResult(current.die, animationName, repeat, dieDelayMs);
      },
      castSkill: (entity) => {
        const current = resolveStudioAnimationsFromEntity(entity);
        return createAnimationResult(
          current.castSkill ?? current.castSpell,
          animationName,
          repeat,
        );
      },
    };
  }

  const result: ActionBattleAnimationOptions = {};

  if (hasGraphic(animations.attack)) {
    result.attack = {
      animationName,
      graphic: animations.attack,
      repeat,
    };
  }

  if (hasGraphic(animations.hurt)) {
    result.hurt = {
      animationName,
      graphic: animations.hurt,
      repeat,
    };
  }

  if (hasGraphic(animations.die)) {
    result.die = {
      animationName,
      graphic: animations.die,
      repeat,
      delayMs: dieDelayMs,
    };
  }

  const castSkill = animations.castSkill ?? animations.castSpell;
  if (hasGraphic(castSkill)) {
    result.castSkill = {
      animationName,
      graphic: castSkill,
      repeat,
    };
  }

  return result;
};
