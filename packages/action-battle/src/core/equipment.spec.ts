import { describe, expect, test } from "vitest";
import {
  resolveActionBattleWeapon,
  resolveActionBattleWeaponAttackProfile,
} from "./equipment";

describe("equipment helpers", () => {
  test("resolves attack profile from equipped weapon data", () => {
    const attackProfile = {
      id: "dagger",
      startupMs: 40,
      activeMs: 70,
      recoveryMs: 120,
    };
    const entity = {
      equipments: () => [{ id: () => "dagger" }],
      databaseById: (id: string) =>
        id === "dagger"
          ? {
              _type: "weapon",
              attackProfile,
            }
          : null,
    };

    expect(resolveActionBattleWeaponAttackProfile(entity)).toBe(attackProfile);
  });

  test("ignores non-weapon equipment", () => {
    const entity = {
      equipments: () => [{ id: () => "ring" }],
      databaseById: () => ({
        _type: "armor",
        attackProfile: { id: "invalid" },
      }),
    };

    expect(resolveActionBattleWeaponAttackProfile(entity)).toBeNull();
  });

  test("resolves serialized equipment ids as well as reactive accessors", () => {
    const weapon = { id: "bow", _type: "weapon", knockbackForce: 70 };
    const entity = {
      equipments: () => [{ id: "bow" }],
      databaseById: (id: string) => id === weapon.id ? weapon : null,
    };

    expect(resolveActionBattleWeapon(entity)).toBe(weapon);
  });
});
