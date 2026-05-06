import type {
  ActionBattleAiBehavior,
  ActionBattleCombatSystem,
  ActionBattleHitHooks,
  ActionBattleHitbox,
} from "./core/contracts";

export type ActionBattleAoeMask = string[] | string;

export type ActionBattleActionBarMode = "items" | "skills" | "both";

export type ActionBattleTargetingAffects = "events" | "players" | "both";

export type ActionBattleAnimationKey =
  | "attack"
  | "hurt"
  | "die"
  | "castSkill"
  | "castSpell";

export type ActionBattleAnimationResult =
  | string
  | {
      animationName?: string;
      graphic?: string | string[];
      repeat?: number;
      waitEnd?: boolean;
      delayMs?: number;
    }
  | null
  | undefined;

export type ActionBattleAnimationEntity = {
  setGraphicAnimation(animationName: string, repeat: number): void;
  setGraphicAnimation(
    animationName: string,
    graphic: string | string[],
    repeat: number
  ): void;
  [key: string]: any;
};

export interface ActionBattleAnimationContext {
  skill?: any;
  attacker?: ActionBattleAnimationEntity;
  target?: ActionBattleAnimationEntity;
}

export type ActionBattleAnimationResolver = (
  entity: ActionBattleAnimationEntity,
  context?: ActionBattleAnimationContext
) => ActionBattleAnimationResult;

export type ActionBattleAnimationOptions = Partial<
  Record<
    ActionBattleAnimationKey,
    ActionBattleAnimationResult | ActionBattleAnimationResolver
  >
>;

export interface ActionBattleSkillTargeting {
  range: number;
  aoeMask?: ActionBattleAoeMask;
}

export type ActionBattleSkillTargetingResolver = (
  skill: any
) => ActionBattleSkillTargeting | null | undefined;

export interface ActionBattleUiActionBarOptions {
  enabled?: boolean;
  autoOpen?: boolean;
  mode?: ActionBattleActionBarMode;
}

export interface ActionBattleUiTargetingOptions {
  enabled?: boolean;
  showGrid?: boolean;
  tileSize?: { width: number; height: number };
  colors?: {
    area?: number;
    edge?: number;
    cursor?: number;
  };
}

export interface ActionBattleUiOptions {
  actionBar?: ActionBattleUiActionBarOptions;
  targeting?: ActionBattleUiTargetingOptions;
}

export type ActionBattleAttackDirection =
  | "up"
  | "down"
  | "left"
  | "right"
  | "default";

export interface ActionBattleAttackHitboxConfig {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export type ActionBattleAttackHitboxMap = Partial<
  Record<ActionBattleAttackDirection, ActionBattleAttackHitboxConfig>
>;

export type ActionBattleAttackHitPolicy =
  | "oncePerTarget"
  | "allowRepeatHits";

export interface ActionBattleHitReactionProfile {
  invincibilityMs?: number;
  hitstunMs?: number;
  staggerPower?: number;
}

export interface NormalizedActionBattleHitReactionProfile {
  invincibilityMs: number;
  hitstunMs: number;
  staggerPower: number;
}

export interface ActionBattleAttackProfile {
  id?: string;
  startupMs?: number;
  activeMs?: number;
  recoveryMs?: number;
  cooldownMs?: number;
  movementLock?: boolean;
  directionLock?: boolean;
  animationKey?: ActionBattleAnimationKey;
  hitPolicy?: ActionBattleAttackHitPolicy;
  reaction?: ActionBattleHitReactionProfile;
  hitboxes?: ActionBattleAttackHitboxMap;
}

export interface NormalizedActionBattleAttackProfile
  extends Required<Omit<ActionBattleAttackProfile, "hitboxes" | "reaction">> {
  reaction: NormalizedActionBattleHitReactionProfile;
  hitboxes?: ActionBattleAttackHitboxMap;
  totalDurationMs: number;
}

export interface ActionBattleSkillOptions {
  getTargeting?: ActionBattleSkillTargetingResolver;
  defaultAoeMask?: ActionBattleAoeMask;
}

export interface ActionBattleTargetingOptions {
  affects?: ActionBattleTargetingAffects;
  allowEmptyTarget?: boolean;
}

export interface ActionBattleDebugOptions {
  attacks?: boolean;
}

export interface ActionBattleAttackOptions {
  profile?: ActionBattleAttackProfile;
  lockMovement?: boolean;
  lockDurationMs?: number;
  showPreview?: boolean;
  previewDurationMs?: number;
  previewColor?: number;
  previewAccentColor?: number;
  hitboxes?: ActionBattleAttackHitboxMap;
  resolveHitboxes?: (context: {
    player: any;
    direction: string;
    defaultHitboxes: ActionBattleHitbox[];
  }) => ActionBattleHitbox[];
}

export interface ActionBattleCombatOptions {
  damage?: ActionBattleCombatSystem["resolveDamage"];
  knockback?: ActionBattleCombatSystem["resolveKnockback"];
  hooks?: ActionBattleHitHooks;
}

export interface ActionBattleAiSystemOptions {
  behaviors?: Record<string, ActionBattleAiBehavior>;
}

export interface ActionBattleSystemOptions {
  combat?: ActionBattleCombatOptions;
  ai?: ActionBattleAiSystemOptions;
}

export interface ActionBattleOptions {
  ui?: ActionBattleUiOptions;
  skills?: ActionBattleSkillOptions;
  targeting?: ActionBattleTargetingOptions;
  attack?: ActionBattleAttackOptions;
  debug?: ActionBattleDebugOptions;
  animations?: ActionBattleAnimationOptions;
  systems?: ActionBattleSystemOptions;
}

export interface ActionBattleActionBarItem {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  quantity?: number;
  usable?: boolean;
}

export interface ActionBattleActionBarSkill {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  spCost?: number;
  usable?: boolean;
  range?: number;
  aoeMask?: string[];
  key?: string;
}

export interface ActionBattleActionBarData {
  items: ActionBattleActionBarItem[];
  skills: ActionBattleActionBarSkill[];
}
