import server from "./server";
import client from "./client";
import { createModule } from "@rpgjs/common";
export { BattleAi, AiState, EnemyType, AttackPattern } from "./ai.server";
export { DEFAULT_PLAYER_ATTACK_HITBOXES } from "./server";

export function provideActionBattle() {
  return createModule("ActionBattle", [
    {
      server,
      client,
    },
  ]); 
}