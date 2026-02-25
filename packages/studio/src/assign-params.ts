import { RpgPlayer } from "@rpgjs/server";
import { ProjectBasic } from "@common/types/project";

export function assignParams(player: RpgPlayer, config: ProjectBasic) {
  player.level = config.initialLevel ?? 1;
  player.finalLevel = config.finalLevel ?? 99;
  player.expCurve = config.expCurve ?? {
    basis: 30,
    extra: 20,
    accelerationA: 30,
    accelerationB: 30,
  };

  if (config.parameters) {
    for (const paramName in config.parameters) {
      player.addParameter(paramName, config.parameters[paramName]);
    }
  }

  if (config.startingInventory) {
    for (const item of config.startingInventory) {
      if (!item.itemId) continue;
      player.addItem(item.itemId, item.amount);
    }
  }
   
  if (config.startingEquipment) {
    for (const type in config.startingEquipment) {
      const itemId = config.startingEquipment[type];
      if (!itemId) continue;
      player.equip(itemId, 'auto');
    }
  }
}