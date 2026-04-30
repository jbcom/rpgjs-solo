import type { RpgEvent } from "@rpgjs/server";
import { BattleAi, type BattleAiOptions } from "../ai.server";

export interface ActionBattleEnemyPreset extends BattleAiOptions {
  stats?: (event: RpgEvent) => void;
}

export type ActionBattleEnemyPresetMap = Record<string, ActionBattleEnemyPreset>;

export const createActionEnemy = (
  event: RpgEvent,
  presetOrOptions: string | BattleAiOptions,
  presets: ActionBattleEnemyPresetMap = {}
) => {
  const options =
    typeof presetOrOptions === "string"
      ? presets[presetOrOptions]
      : presetOrOptions;
  if (!options) {
    throw new Error(`Action battle enemy preset not found: ${presetOrOptions}`);
  }
  const preset = options as ActionBattleEnemyPreset;
  preset.stats?.(event);
  return new BattleAi(event, options);
};
