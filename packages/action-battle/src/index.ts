import server from "./server";
import client from "./client";
import { createModule } from "@rpgjs/common";

// AI exports
export { BattleAi, AiState, EnemyType, AttackPattern, AiDebug, DEFAULT_KNOCKBACK } from "./ai.server";

// Types exports
export type { HitResult, ApplyHitHooks } from "./ai.server";

// Server exports
export { DEFAULT_PLAYER_ATTACK_HITBOXES, getPlayerWeaponKnockbackForce, applyPlayerHitToEvent } from "./server";

export function provideActionBattle() {
  return createModule("ActionBattle", [
    {
      server,
      client,
    },
  ]); 
}