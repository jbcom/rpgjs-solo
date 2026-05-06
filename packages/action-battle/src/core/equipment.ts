import type { ActionBattleAttackProfile } from "../types";

const resolveItemId = (item: any) => item?.id?.() ?? item?.id;

export function resolveActionBattleWeaponAttackProfile(
  entity: any
): ActionBattleAttackProfile | null {
  const equipments = entity?.equipments?.() || [];
  for (const item of equipments) {
    const itemId = resolveItemId(item);
    const itemData = entity?.databaseById?.(itemId);
    if (itemData?._type === "weapon" && itemData.attackProfile) {
      return itemData.attackProfile;
    }
  }
  return null;
}
