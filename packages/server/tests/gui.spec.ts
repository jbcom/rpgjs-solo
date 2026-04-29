import { describe, expect, test } from "vitest";
import { MenuGui, signal } from "../src";

describe("GUI", () => {
  test("main menu sends cloneable data when inventory data contains signals", () => {
    const inventoryItem = {
      id: signal("sword"),
      name: signal("Bronze Sword"),
      description: signal("A starter weapon"),
      quantity: signal(1),
      atk: signal(5),
      pdef: signal(0),
      sdef: signal(0),
      icon: signal("inventory-icon"),
    };
    const skill = {
      id: signal("fire"),
      name: signal("Fire"),
      description: signal("Small fire spell"),
      spCost: signal(3),
    };
    const sent: any[] = [];
    const player: any = {
      canMove: signal(true),
      items: signal([inventoryItem]),
      equipments: signal([inventoryItem]),
      skills: signal([skill]),
      param: { str: 4, dex: 3, int: 2, agi: 1, maxHp: 20, maxSp: 10 },
      pdef: 1,
      sdef: 2,
      atk: 5,
      expForNextlevel: signal(150),
      databaseById() {
        return {
          _type: signal("weapon"),
          icon: signal("db-icon"),
          consumable: signal(false),
        };
      },
      emit(type: string, value: any) {
        sent.push(structuredClone({ type, value }));
      },
    };

    const gui = new MenuGui(player);
    const pending = gui.open();

    expect(sent[0]).toMatchObject({
      type: "gui.open",
      value: {
        guiId: "rpg-main-menu",
        data: {
          expForNextlevel: 150,
          items: [
            {
              id: "sword",
              icon: "db-icon",
              type: "weapon",
              equipped: true,
            },
          ],
          skills: [
            {
              id: "fire",
              name: "Fire",
              spCost: 3,
            },
          ],
        },
      },
    });

    gui.close();
    return pending;
  });
});
