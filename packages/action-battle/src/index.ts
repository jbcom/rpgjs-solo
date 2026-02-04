import server, { createActionBattleServer } from "./server";
import client, { createActionBattleClient } from "./client";
import { createModule } from "@rpgjs/common";
import type { ActionBattleOptions } from "./types";

// AI exports
export { BattleAi, AiState, EnemyType, AttackPattern, AiDebug, DEFAULT_KNOCKBACK } from "./ai.server";

// Types exports
export type { HitResult, ApplyHitHooks } from "./ai.server";
export type {
  ActionBattleOptions,
  ActionBattleActionBarData,
  ActionBattleActionBarItem,
  ActionBattleActionBarSkill,
  ActionBattleSkillTargeting,
  ActionBattleSkillTargetingResolver,
  ActionBattleUiOptions,
  ActionBattleUiActionBarOptions,
  ActionBattleUiTargetingOptions,
} from "./types";

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
