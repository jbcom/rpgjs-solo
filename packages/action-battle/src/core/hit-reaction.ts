import type {
  ActionBattleHitReactionProfile,
  NormalizedActionBattleHitReactionProfile,
} from "../types";

export const DEFAULT_ACTION_BATTLE_HIT_REACTION: NormalizedActionBattleHitReactionProfile = {
  invincibilityMs: 250,
  hitstunMs: 150,
  staggerPower: 1,
};

const STATE_KEY = "__actionBattleHitReaction";

interface ActionBattleHitReactionRuntimeState {
  invincibleUntil: number;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const nonNegativeMs = (value: unknown, fallback: number) =>
  isFiniteNumber(value) ? Math.max(0, value) : fallback;

const nonNegativeValue = (value: unknown, fallback: number) =>
  isFiniteNumber(value) ? Math.max(0, value) : fallback;

const getRuntimeState = (entity: any): ActionBattleHitReactionRuntimeState => {
  if (!entity[STATE_KEY]) {
    entity[STATE_KEY] = {
      invincibleUntil: 0,
    };
  }
  return entity[STATE_KEY];
};

export function normalizeActionBattleHitReaction(
  reaction: ActionBattleHitReactionProfile | undefined,
  defaults: NormalizedActionBattleHitReactionProfile =
    DEFAULT_ACTION_BATTLE_HIT_REACTION
): NormalizedActionBattleHitReactionProfile {
  return {
    invincibilityMs: nonNegativeMs(
      reaction?.invincibilityMs,
      defaults.invincibilityMs
    ),
    hitstunMs: nonNegativeMs(reaction?.hitstunMs, defaults.hitstunMs),
    staggerPower: nonNegativeValue(
      reaction?.staggerPower,
      defaults.staggerPower
    ),
  };
}

export function isActionBattleEntityInvincible(
  entity: any,
  now = Date.now()
): boolean {
  if (!entity) return false;
  return getRuntimeState(entity).invincibleUntil > now;
}

export function setActionBattleInvincibility(
  entity: any,
  durationMs: number,
  now = Date.now()
): void {
  if (!entity || durationMs <= 0) return;
  const state = getRuntimeState(entity);
  state.invincibleUntil = Math.max(state.invincibleUntil, now + durationMs);
}
