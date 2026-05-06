import { ActionBattleOptions } from "./types";
import { normalizeActionBattleAttackProfile } from "./core/attack-profile";

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
  attack: {
    lockMovement: true,
    lockDurationMs: 350,
    showPreview: true,
    previewDurationMs: 180,
    previewColor: 0xfff3b0,
    previewAccentColor: 0xffffff,
  },
  animations: {},
};

let currentActionBattleOptions: ActionBattleOptions =
  DEFAULT_ACTION_BATTLE_OPTIONS;

export function normalizeActionBattleOptions(
  options: ActionBattleOptions = {}
): ActionBattleOptions {
  const attack = {
    ...DEFAULT_ACTION_BATTLE_OPTIONS.attack,
    ...options.attack,
  };
  const attackProfile = normalizeActionBattleAttackProfile(attack.profile, {
    lockMovement: attack.lockMovement,
    lockDurationMs: attack.lockDurationMs,
    hitboxes: attack.hitboxes,
  });

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
    debug: {
      ...DEFAULT_ACTION_BATTLE_OPTIONS.debug,
      ...options.debug,
    },
    attack: {
      ...attack,
      profile: attackProfile,
    },
    animations: {
      ...DEFAULT_ACTION_BATTLE_OPTIONS.animations,
      ...options.animations,
    },
    systems: {
      combat: {
        ...DEFAULT_ACTION_BATTLE_OPTIONS.systems?.combat,
        ...options.systems?.combat,
        hooks: {
          ...DEFAULT_ACTION_BATTLE_OPTIONS.systems?.combat?.hooks,
          ...options.systems?.combat?.hooks,
        },
      },
      ai: {
        ...DEFAULT_ACTION_BATTLE_OPTIONS.systems?.ai,
        ...options.systems?.ai,
        behaviors: {
          ...DEFAULT_ACTION_BATTLE_OPTIONS.systems?.ai?.behaviors,
          ...options.systems?.ai?.behaviors,
        },
      },
    },
  };
}

export function setActionBattleOptions(options: ActionBattleOptions) {
  currentActionBattleOptions = options;
}

export function getActionBattleOptions(): ActionBattleOptions {
  return currentActionBattleOptions;
}
