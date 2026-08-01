import type { ActionBattleEntity } from "./contracts";

/**
 * A delayed combat action is valid only for the exact continuous life in which
 * it was authored. RPGJS actors expose `lifeGeneration` from their HP setter;
 * the fallback accessor keeps lightweight/custom test entities deterministic.
 */
export interface ActionBattleActorGeneration {
  life: number;
}

interface FallbackLifeState {
  generation: number;
  hp: number;
  instrumented: boolean;
}

const fallbackLifeStates = new WeakMap<object, FallbackLifeState>();

const nativeLifeGeneration = (entity: any): number | undefined => {
  const generation = Number(entity?.lifeGeneration);
  return Number.isSafeInteger(generation) && generation >= 0
    ? generation
    : undefined;
};

const ensureFallbackLifeState = (entity: any): FallbackLifeState => {
  const existing = fallbackLifeStates.get(entity);
  if (existing) return existing;

  const state: FallbackLifeState = {
    generation: 0,
    hp: Number(entity?.hp),
    instrumented: false,
  };
  fallbackLifeStates.set(entity, state);

  const descriptor = Object.getOwnPropertyDescriptor(entity, "hp");
  if (
    descriptor
    && "value" in descriptor
    && descriptor.configurable !== false
  ) {
    state.hp = Number(descriptor.value);
    Object.defineProperty(entity, "hp", {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: () => state.hp,
      set: (value: number) => {
        const next = Number(value);
        if ((state.hp <= 0) !== (next <= 0)) {
          state.generation++;
        }
        state.hp = next;
      },
    });
    state.instrumented = true;
  }

  return state;
};

export const initializeActionBattleActorLife = (
  entity: ActionBattleEntity,
): void => {
  if (nativeLifeGeneration(entity) !== undefined) return;
  ensureFallbackLifeState(entity);
};

export const captureActionBattleActorGeneration = (
  entity: ActionBattleEntity,
): ActionBattleActorGeneration => {
  const native = nativeLifeGeneration(entity);
  if (native !== undefined) return { life: native };

  const state = ensureFallbackLifeState(entity);
  if (!state.instrumented) {
    const hp = Number((entity as any).hp);
    if ((state.hp <= 0) !== (hp <= 0)) state.generation++;
    state.hp = hp;
  }
  return { life: state.generation };
};

export const isActionBattleActorGenerationCurrent = (
  entity: ActionBattleEntity,
  generation: ActionBattleActorGeneration,
): boolean => {
  const hp = (entity as any).hp;
  return (
    (typeof hp !== "number" || hp > 0)
    && captureActionBattleActorGeneration(entity).life === generation.life
  );
};
