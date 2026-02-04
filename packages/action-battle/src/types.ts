export type ActionBattleAoeMask = string[] | string;

export type ActionBattleActionBarMode = "items" | "skills" | "both";

export type ActionBattleTargetingAffects = "events" | "players" | "both";

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
