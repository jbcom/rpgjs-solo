export type ActionBattleAoeMask = string[] | string;

export type ActionBattleActionBarMode = "items" | "skills" | "both";

export type ActionBattleTargetingAffects = "events" | "players" | "both";

export type ActionBattleAnimationKey =
  | "attack"
  | "hurt"
  | "die"
  | "castSkill";

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

export interface ActionBattleSkillOptions {
  getTargeting?: ActionBattleSkillTargetingResolver;
  defaultAoeMask?: ActionBattleAoeMask;
}

export interface ActionBattleTargetingOptions {
  affects?: ActionBattleTargetingAffects;
  allowEmptyTarget?: boolean;
}

export interface ActionBattleOptions {
  ui?: ActionBattleUiOptions;
  skills?: ActionBattleSkillOptions;
  targeting?: ActionBattleTargetingOptions;
  animations?: ActionBattleAnimationOptions;
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
