import { ActionBattleOptions } from "./types";

export const DEFAULT_ACTION_BATTLE_OPTIONS: ActionBattleOptions = {
  ui: {
    actionBar: {
      enabled: false,
      autoOpen: false,
      mode: "both",
    },
    targeting: {
      enabled: true,
      showGrid: true,
      colors: {
        area: 0x2f9ef7,
        edge: 0x1b6a98,
        cursor: 0xffd166,
      },
    },
  },
  skills: {
    defaultAoeMask: ["#"],
  },
  targeting: {
    affects: "events",
    allowEmptyTarget: true,
  },
  animations: {},
};

let currentActionBattleOptions: ActionBattleOptions =
  DEFAULT_ACTION_BATTLE_OPTIONS;

export function normalizeActionBattleOptions(
  options: ActionBattleOptions = {}
): ActionBattleOptions {
  return {
    ui: {
      actionBar: {
        ...DEFAULT_ACTION_BATTLE_OPTIONS.ui?.actionBar,
        ...options.ui?.actionBar,
      },
      targeting: {
        ...DEFAULT_ACTION_BATTLE_OPTIONS.ui?.targeting,
        ...options.ui?.targeting,
        colors: {
          ...DEFAULT_ACTION_BATTLE_OPTIONS.ui?.targeting?.colors,
          ...options.ui?.targeting?.colors,
        },
      },
    },
    skills: {
      ...DEFAULT_ACTION_BATTLE_OPTIONS.skills,
      ...options.skills,
    },
    targeting: {
      ...DEFAULT_ACTION_BATTLE_OPTIONS.targeting,
      ...options.targeting,
    },
    animations: {
      ...DEFAULT_ACTION_BATTLE_OPTIONS.animations,
      ...options.animations,
    },
  };
}

export function setActionBattleOptions(options: ActionBattleOptions) {
  currentActionBattleOptions = options;
}

export function getActionBattleOptions(): ActionBattleOptions {
  return currentActionBattleOptions;
}
