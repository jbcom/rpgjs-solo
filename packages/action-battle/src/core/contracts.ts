import type { RpgEvent, RpgPlayer } from "@rpgjs/server";
import type { AttackPattern, EnemyType, AiState } from "../ai.server";

export type ActionBattleEntity = RpgPlayer | RpgEvent;

export interface ActionBattleHitbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ActionBattleDirection {
  x: number;
  y: number;
}

export interface ActionBattleAttackContext {
  attacker: ActionBattleEntity;
  target?: ActionBattleEntity | null;
  direction?: string;
  skill?: any;
  pattern?: AttackPattern | string;
  map?: any;
  now: number;
}

export interface ActionBattleDamageContext {
  attacker: ActionBattleEntity;
  target: ActionBattleEntity;
  skill?: any;
  pattern?: AttackPattern | string;
}

export interface ActionBattleDamageResult {
  damage: number;
  defeated: boolean;
  raw?: any;
}

export interface ActionBattleKnockbackContext {
  attacker: ActionBattleEntity;
  target: ActionBattleEntity;
  damage: ActionBattleDamageResult;
  weapon?: any;
}

export interface ActionBattleKnockbackResult {
  force: number;
  duration: number;
  direction?: ActionBattleDirection;
}

export interface ActionBattleHitContext {
  attacker: ActionBattleEntity;
  target: ActionBattleEntity;
  skill?: any;
  pattern?: AttackPattern | string;
  damage?: ActionBattleDamageResult;
  knockback?: ActionBattleKnockbackResult;
  cancelled?: boolean;
  metadata?: Record<string, any>;
}

export interface ActionBattleHitResult {
  damage: number;
  knockbackForce: number;
  knockbackDuration: number;
  defeated: boolean;
  attacker: ActionBattleEntity;
  target: ActionBattleEntity;
  rawDamage?: any;
  cancelled?: boolean;
  metadata?: Record<string, any>;
}

export interface ActionBattleHitHooks {
  beforeHit?: (
    context: ActionBattleHitContext
  ) => ActionBattleHitContext | false | void;
  afterDamage?: (
    context: ActionBattleHitContext
  ) => ActionBattleHitContext | void;
  afterHit?: (result: ActionBattleHitResult) => void;
}

export interface ActionBattleCombatSystem {
  resolveHitboxes(context: ActionBattleAttackContext): ActionBattleHitbox[];
  resolveDamage(context: ActionBattleDamageContext): ActionBattleDamageResult;
  resolveKnockback(
    context: ActionBattleKnockbackContext
  ): ActionBattleKnockbackResult;
  hooks?: ActionBattleHitHooks;
}

export interface ActionBattleAiContext {
  event: RpgEvent;
  target: RpgPlayer | null;
  state: AiState;
  enemyType: EnemyType;
  distance: number | null;
  hpPercent: number | null;
  now: number;
}

export interface ActionBattleAiDecision {
  mode?: "assault" | "tactical" | "retreat";
  attackPatterns?: AttackPattern[];
  attackCooldown?: number;
  moveToCooldown?: number;
  metadata?: Record<string, any>;
}

export type ActionBattleAiBehavior = (
  context: ActionBattleAiContext
) => ActionBattleAiDecision | void;

export interface ActionBattleSystems {
  combat: ActionBattleCombatSystem;
  ai: {
    behaviors: Record<string, ActionBattleAiBehavior>;
  };
}
