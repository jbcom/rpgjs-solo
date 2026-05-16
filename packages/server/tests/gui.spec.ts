import { describe, expect, test, vi } from "vitest";
import { MenuGui, SaveLoadGui, signal } from "../src";

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

  test("main menu item and equipment actions sync the player and refresh the client", async () => {
    const sent: any[] = [];
    const player: any = {
      canMove: true,
      items: signal([{ id: "potion", name: "Potion", quantity: 2 }]),
      equipments: signal([]),
      skills: signal([]),
      param: {},
      useItem: vi.fn(),
      equip: vi.fn(),
      syncChanges: vi.fn(),
      showNotification: vi.fn(),
      databaseById() {
        return { _type: "item", consumable: true };
      },
      emit(type: string, value: any) {
        sent.push({ type, value });
      },
    };

    const gui = new MenuGui(player);
    const pending = gui.open();

    await gui.emit("useItem", { id: "potion", clientActionId: "use-1" });
    await gui.emit("equipItem", { id: "sword", equip: true, clientActionId: "equip-1" });

    expect(player.useItem).toHaveBeenCalledWith("potion");
    expect(player.equip).toHaveBeenCalledWith("sword", true);
    expect(player.syncChanges).toHaveBeenCalledTimes(2);
    expect(player.showNotification).not.toHaveBeenCalled();
    expect(sent.filter((event) => event.type === "gui.update")).toMatchObject([
      { value: { guiId: "rpg-main-menu", clientActionId: "use-1" } },
      { value: { guiId: "rpg-main-menu", clientActionId: "equip-1" } },
    ]);

    gui.close();
    await pending;
  });

  test("main menu reports action errors and still refreshes the menu", async () => {
    const sent: any[] = [];
    const player: any = {
      canMove: true,
      items: signal([{ id: "potion", name: "Potion", quantity: 1 }]),
      equipments: signal([]),
      skills: signal([]),
      param: {},
      useItem: vi.fn(() => {
        throw { msg: "Cannot use item" };
      }),
      syncChanges: vi.fn(),
      showNotification: vi.fn(),
      databaseById() {
        return { _type: "item", consumable: true };
      },
      emit(type: string, value: any) {
        sent.push({ type, value });
      },
    };

    const gui = new MenuGui(player);
    const pending = gui.open();

    await gui.emit("useItem", { id: "potion", clientActionId: "use-error" });

    expect(player.syncChanges).not.toHaveBeenCalled();
    expect(player.showNotification).toHaveBeenCalledWith("Cannot use item");
    expect(sent.some((event) => event.type === "gui.update" && event.value.clientActionId === "use-error")).toBe(true);

    gui.close();
    await pending;
  });

  test("main menu exit resolves the waiting open call and restores movement", async () => {
    const player: any = {
      canMove: true,
      items: signal([]),
      equipments: signal([]),
      skills: signal([]),
      param: {},
      emit: vi.fn(),
    };

    const gui = new MenuGui(player);
    const pending = gui.open();

    expect(player.canMove).toBe(false);

    await gui.emit("exit", {});

    await expect(pending).resolves.toBe("exit");
    expect(player.canMove).toBe(true);
    expect(player.emit).toHaveBeenCalledWith("gui.exit", "rpg-main-menu");
  });

  test("save/load gui opens sanitized slot data and loads a selected slot", async () => {
    const sent: any[] = [];
    const player: any = {
      canMove: true,
      load: vi.fn(() => Promise.resolve({ ok: true })),
      emit(type: string, value: any) {
        sent.push({ type, value });
      },
    };
    const slots = [
      { id: "slot-0", snapshot: "secret", map: "start" },
      null,
    ] as any[];

    const gui = new SaveLoadGui(player);
    const pending = gui.open(slots, { maxSlots: 3 });

    expect(sent[0]).toEqual({
      type: "gui.open",
      value: {
        guiId: "rpg-save",
        data: {
          mode: "load",
          slots: [{ id: "slot-0", map: "start" }, null, null],
        },
      },
    });

    await gui.emit("select", { index: 0 });

    expect(player.load).toHaveBeenCalledWith(
      0,
      { reason: "load", source: "gui" },
      { changeMap: true },
    );
    await expect(pending).resolves.toBe(0);
    expect(player.canMove).toBe(true);
  });

  test("save/load gui ignores invalid selections and failed loads", async () => {
    const player: any = {
      canMove: true,
      load: vi.fn(() => Promise.resolve({ ok: false })),
      emit: vi.fn(),
    };
    const gui = new SaveLoadGui(player);
    const pending = gui.open([{ id: "slot-0", snapshot: "secret" }] as any[]);

    await gui.emit("select", { index: -1 });
    await gui.emit("select", { index: 10 });
    await gui.emit("select", { index: "0" });
    await gui.emit("select", { index: 0 });

    expect(player.load).toHaveBeenCalledTimes(1);

    gui.close(null);
    await expect(pending).resolves.toBeNull();
  });

  test("save/load gui updates save slots when saving succeeds", async () => {
    const player: any = {
      canMove: true,
      save: vi.fn(() => Promise.resolve({ meta: { id: "slot-1", map: "town" } })),
      emit: vi.fn(),
    };
    const slots = [null] as any[];
    const gui = new SaveLoadGui(player);
    const pending = gui.open(slots, { mode: "save", maxSlots: 2 });

    await gui.emit("save", { index: 1 });

    expect(player.save).toHaveBeenCalledWith(
      1,
      {},
      { reason: "manual", source: "gui" },
    );
    expect(slots[1]).toEqual({ id: "slot-1", map: "town" });
    await expect(pending).resolves.toBe(1);
  });
});
