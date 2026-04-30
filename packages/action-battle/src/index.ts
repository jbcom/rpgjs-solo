import server, { createActionBattleServer } from "./server";
import client, { createActionBattleClient } from "./client";
import { createModule } from "@rpgjs/common";
import type { ActionBattleOptions } from "./types";

// AI exports
export { BattleAi, AiState, EnemyType, AttackPattern, AiDebug, DEFAULT_KNOCKBACK } from "./ai.server";

// Types exports
export type { HitResult, ApplyHitHooks, BattleAiOptions } from "./ai.server";
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
