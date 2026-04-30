import type { ActionBattleOptions } from "../types";
import { defaultActionBattleSystems } from "./defaults";
import type { ActionBattleSystems } from "./contracts";

const mergeSystems = (options: ActionBattleOptions = {}): ActionBattleSystems => ({
  combat: {
    ...defaultActionBattleSystems.combat,
    resolveDamage:
      options.systems?.combat?.damage ??
      defaultActionBattleSystems.combat.resolveDamage,
    resolveKnockback:
      options.systems?.combat?.knockback ??
      defaultActionBattleSystems.combat.resolveKnockback,
    hooks: {
      ...defaultActionBattleSystems.combat.hooks,
      ...options.systems?.combat?.hooks,
    },
  },
  ai: {
    behaviors: {
      ...defaultActionBattleSystems.ai.behaviors,
      ...options.systems?.ai?.behaviors,
    },
  },
});

let currentActionBattleSystems = mergeSystems();

export const setActionBattleSystems = (options: ActionBattleOptions = {}) => {
  currentActionBattleSystems = mergeSystems(options);
};

export const getActionBattleSystems = () => currentActionBattleSystems;

export const createActionBattleSystems = mergeSystems;
