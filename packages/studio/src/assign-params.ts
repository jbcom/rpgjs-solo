import { RpgPlayer } from "@rpgjs/server";
import { ProjectBasic } from "@common/types/project";

const resolveDatabaseItem = (player: RpgPlayer, itemId: string) => {
  try {
    return (player as any).databaseById?.(itemId);
  } catch {
    return null;
  }
};

const getItemType = (item: any): string | undefined => {
  return item?._type ?? item?.itemType;
};

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
      player.setParameter(paramName, config.parameters[paramName]);
    }
  }

  if (config.startingInventory) {
    for (const item of config.startingInventory) {
      if (!item.itemId) continue;
      const amount = Number(item.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      player.addItem(item.itemId, amount);
    }
  }
   
  if (config.startingEquipment) {
    for (const type in config.startingEquipment) {
      const itemId = config.startingEquipment[type];
      if (!itemId) continue;
      const item = resolveDatabaseItem(player, itemId);
      const itemType = getItemType(item);
      if (itemType !== "weapon" && itemType !== "armor") {
        console.warn(
          `[StudioGame] starting equipment ${type}=${itemId} is not a weapon or armor`,
        );
        continue;
      }
      player.equip(itemId, 'auto');
    }
  }
}
