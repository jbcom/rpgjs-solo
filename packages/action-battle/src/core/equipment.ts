import type { ActionBattleAttackProfile } from "../types";

const resolveItemId = (item: any) => item?.id?.() ?? item?.id;

export function resolveActionBattleWeapon(entity: any): any | null {
  const equipments = entity?.equipments?.() || [];
  for (const item of equipments) {
    const itemId = resolveItemId(item);
    const itemData = entity?.databaseById?.(itemId);
    if (itemData?._type === "weapon") {
      return itemData;
    }
  }
  return null;
}

export function resolveActionBattleWeaponAttackProfile(
  entity: any
): ActionBattleAttackProfile | null {
  return resolveActionBattleWeapon(entity)?.attackProfile ?? null;
}
