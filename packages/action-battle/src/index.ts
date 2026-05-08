import server, { createActionBattleServer } from "./server";
import client, { createActionBattleClient } from "./client";
import { createModule } from "@rpgjs/common";
import type { ActionBattleOptions } from "./types";

// AI exports
export { BattleAi, AiState, EnemyType, AttackPattern, AiDebug, DEFAULT_KNOCKBACK } from "./ai.server";

// Types exports
export type {
  HitResult,
  ApplyHitHooks,
  BattleAiOptions,
  BattleAiDefeatedCallback,
  BattleAiDefeatedContext,
  BattleAiDefeatReward,
  BattleAiLegacyDefeatedCallback,
  BattleAiLegacyOptions,
  BattleAiRewardItem,
  BattleAiRewards,
} from "./ai.server";
export type {
  ActionBattleAnimationContext,
  ActionBattleAnimationEntity,
  ActionBattleAnimationKey,
  ActionBattleAnimationOptions,
  ActionBattleAnimationResolver,
  ActionBattleAnimationResult,
  ActionBattleOptions,
  ActionBattleActionBarData,
  ActionBattleActionBarItem,
  ActionBattleActionBarSkill,
  ActionBattleSkillTargeting,
  ActionBattleSkillTargetingResolver,
  ActionBattleAttackOptions,
  ActionBattleUiOptions,
  ActionBattleUiActionBarOptions,
  ActionBattleUiTargetingOptions,
  ActionBattleAttackDirection,
  ActionBattleAttackHitboxConfig,
  ActionBattleAttackHitboxMap,
  ActionBattleAttackHitPolicy,
  ActionBattleAttackProfile,
  ActionBattleDebugOptions,
  ActionBattleHitReactionProfile,
  NormalizedActionBattleHitReactionProfile,
  NormalizedActionBattleAttackProfile,
  ActionBattleCombatOptions,
  ActionBattleSystemOptions,
  ActionBattleAiSystemOptions,
} from "./types";
export type {
  ActionBattleAiBehavior,
  ActionBattleAiContext,
  ActionBattleAiDecision,
  ActionBattleAttackContext,
  ActionBattleCombatSystem,
  ActionBattleDamageContext,
  ActionBattleDamageResult,
  ActionBattleDirection,
  ActionBattleEntity,
  ActionBattleHitContext,
  ActionBattleHitHooks,
  ActionBattleHitResult,
  ActionBattleHitbox,
  ActionBattleKnockbackContext,
  ActionBattleKnockbackResult,
  ActionBattleSystems,
} from "./core/contracts";
export {
  DEFAULT_ACTION_BATTLE_ATTACK_PROFILE,
  normalizeActionBattleAttackProfile,
  type ActionBattleAttackProfileFallbacks,
} from "./core/attack-profile";
export {
  ACTION_BATTLE_HITBOX_FRAME_MS,
  ActionBattleHitTracker,
  createActionBattleAttackId,
  getNormalizedActionBattleAttackProfile,
  resolveActionBattleHitboxSpeed,
  scheduleActionBattleStartup,
} from "./core/attack-runtime";
export {
  DEFAULT_ACTION_BATTLE_HIT_REACTION,
  isActionBattleEntityInvincible,
  normalizeActionBattleHitReaction,
  setActionBattleInvincibility,
} from "./core/hit-reaction";
export {
  DEFAULT_ACTION_BATTLE_ENEMY_ATTACK_PROFILES,
  normalizeActionBattleEnemyAttackProfiles,
  type ActionBattleEnemyAttackProfileKey,
  type ActionBattleEnemyAttackProfileMap,
  type NormalizedActionBattleEnemyAttackProfileMap,
} from "./core/enemy-attack-profiles";
export { resolveActionBattleWeaponAttackProfile } from "./core/equipment";
export {
  DEFAULT_ZELDA_PLAYER_HITBOXES,
  createDefaultPlayerHitboxResolver,
  defaultCombatSystem,
  defaultEnemyBehaviors,
  defaultKnockbackResolver,
  defaultRpgjsDamageResolver,
} from "./core/defaults";
export {
  createActionBattleSystems,
  getActionBattleSystems,
} from "./core/context";
export { applyActionBattleHit } from "./core/hit";
export {
  createActionEnemy,
  type ActionBattleEnemyPreset,
  type ActionBattleEnemyPresetMap,
} from "./enemies/factory";

// Server exports
export {
  DEFAULT_PLAYER_ATTACK_HITBOXES,
  getPlayerWeaponKnockbackForce,
  applyPlayerHitToEvent,
  ACTION_BATTLE_ACTION_BAR_GUI_ID,
  openActionBattleActionBar,
  updateActionBattleActionBar,
  createActionBattleServer,
} from "./server";

export function provideActionBattle(options: ActionBattleOptions = {}) {
  return createModule("ActionBattle", [
    {
      server: createActionBattleServer?.(options),
      client: createActionBattleClient?.(options),
    },
  ]); 
}

export default {
  server,
  client,
};
