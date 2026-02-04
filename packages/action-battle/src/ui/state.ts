import { signal } from "canvasengine";
import { ActionBattleActionBarSkill, ActionBattleOptions } from "../types";
import { DEFAULT_ACTION_BATTLE_OPTIONS, normalizeActionBattleOptions } from "../config";

export interface ActionBattleTargetingState {
  active: boolean;
  skill: ActionBattleActionBarSkill | null;
  range: number;
  offset: { x: number; y: number };
  aoeMask: string[] | string;
}

const defaultTargetingState: ActionBattleTargetingState = {
  active: false,
  skill: null,
  range: 0,
  offset: { x: 0, y: 0 },
  aoeMask: DEFAULT_ACTION_BATTLE_OPTIONS.skills?.defaultAoeMask || ["#"],
};

export const actionBattleUiOptions = signal(
  normalizeActionBattleOptions({}).ui || {}
);
export const actionBattleSkillOptions = signal(
  normalizeActionBattleOptions({}).skills || {}
);

export const actionBattleTargetingState = signal<ActionBattleTargetingState>({
  ...defaultTargetingState,
});

export const setActionBattleOptions = (options: ActionBattleOptions = {}) => {
  const normalized = normalizeActionBattleOptions(options);
  actionBattleUiOptions.set(normalized.ui || {});
  actionBattleSkillOptions.set(normalized.skills || {});
};

export const startTargeting = (skill: ActionBattleActionBarSkill) => {
  const skillsOptions = actionBattleSkillOptions();
  const mask = skill.aoeMask || (skillsOptions.defaultAoeMask as string[]) || ["#"];
  actionBattleTargetingState.set({
    active: true,
    skill,
    range: skill.range ?? 0,
    offset: { x: 0, y: 0 },
    aoeMask: mask,
  });
};

export const stopTargeting = () => {
  actionBattleTargetingState.set({ ...defaultTargetingState });
};

export const moveTargetingOffset = (dx: number, dy: number) => {
  const state = actionBattleTargetingState();
  if (!state.active) return;
  const next = {
    x: state.offset.x + dx,
    y: state.offset.y + dy,
  };
  if (Math.abs(next.x) + Math.abs(next.y) > state.range) {
    return;
  }
  actionBattleTargetingState.set({
    ...state,
    offset: next,
  });
};
