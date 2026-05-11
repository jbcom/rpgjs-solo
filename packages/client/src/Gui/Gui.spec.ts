import { describe, expect, test, vi } from "vitest";
import { Context, injector } from "@signe/di";
import { signal } from "canvasengine";
import { PrebuiltGui } from "@rpgjs/common";
import { WebSocketToken } from "../services/AbstractSocket";

vi.mock("../components/gui", () => {
  const component = () => null;
  return {
    DialogboxComponent: component,
    ShopComponent: component,
    SaveLoadComponent: component,
    MainMenuComponent: component,
    NotificationComponent: component,
    TitleScreenComponent: component,
    GameoverComponent: component,
  };
});

const createGui = async () => {
  const { RpgGui } = await import("./Gui");
  const context = new Context();
  const socket = {
    on: vi.fn(),
    emit: vi.fn(),
  };
  await injector(context, [
    {
      provide: WebSocketToken,
      useValue: socket,
    },
  ]);
  return {
    gui: new RpgGui(context),
    socket,
  };
};

const CanvasGui = () => null;
const VueInventory = {
  name: "inventory",
  render() {
    return null;
  },
};
const VueDialog = {
  name: PrebuiltGui.Dialog,
  render() {
    return null;
  },
};
const VueMainMenu = {
  name: PrebuiltGui.MainMenu,
  render() {
    return null;
  },
};
const VueTooltip = {
  name: "tooltip",
  rpgAttachToSprite: true,
  render() {
    return null;
  },
};

describe("RpgGui Vue integration", () => {
  test("separates CanvasEngine and Vue GUI registries", async () => {
    const { gui } = await createGui();

    gui.add({
      id: "canvas-tooltip",
      component: CanvasGui,
      attachToSprite: true,
    });
    gui.add({
      id: "inventory",
      component: VueInventory,
    });
    gui.add(VueTooltip);

    expect(gui.get("canvas-tooltip")?.component).toBe(CanvasGui);
    expect(gui.get("inventory")?.component).toBe(VueInventory);
    expect(gui.get("tooltip")?.component).toBe(VueTooltip);
    expect(gui.getAttachedGuis().map(item => item.name)).toEqual(["canvas-tooltip"]);
    expect(gui.getAttachedVueGuis().map(item => item.name)).toEqual(["tooltip"]);
  });

  test("synchronizes Vue GUI display and hide states through the Vue bridge", async () => {
    const { gui } = await createGui();
    const bridge = {
      updateGuiState: vi.fn(),
      initializeGuiStates: vi.fn(),
    };

    gui.add({
      id: "inventory",
      component: VueInventory,
    });
    gui._setVueGuiInstance(bridge);

    expect(bridge.initializeGuiStates).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "inventory",
        display: false,
        data: {},
        attachToSprite: false,
      }),
    ]);

    gui.display("inventory", { gold: 12 });
    expect(bridge.updateGuiState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "inventory",
        display: true,
        data: { gold: 12 },
        attachToSprite: false,
      }),
    );

    gui.hide("inventory");
    expect(bridge.updateGuiState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "inventory",
        display: false,
      }),
    );
  });

  test("waits for Vue GUI dependencies before display", async () => {
    const { gui } = await createGui();
    const bridge = {
      updateGuiState: vi.fn(),
      initializeGuiStates: vi.fn(),
    };
    const dependency = signal<any>(undefined);

    gui.add({
      id: "inventory",
      component: VueInventory,
      dependencies: () => [dependency],
    });
    gui._setVueGuiInstance(bridge);
    gui.display("inventory", { items: ["potion"] });

    expect(gui.isDisplaying("inventory")).toBe(false);
    expect(bridge.updateGuiState).not.toHaveBeenCalledWith(
      expect.objectContaining({
        display: true,
      }),
    );

    dependency.set({ id: "player" });

    expect(gui.isDisplaying("inventory")).toBe(true);
    expect(bridge.updateGuiState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: "inventory",
        display: true,
        data: { items: ["potion"] },
      }),
    );
  });

  test("allows Vue GUI entries to replace prebuilt CanvasEngine GUIs", async () => {
    const { gui } = await createGui();
    const bridge = {
      updateGuiState: vi.fn(),
      initializeGuiStates: vi.fn(),
    };

    gui._setVueGuiInstance(bridge);
    gui.add({
      id: PrebuiltGui.Dialog,
      component: VueDialog,
    });

    expect(gui.get(PrebuiltGui.Dialog)?.component).toBe(VueDialog);
    expect(gui.getAll()[PrebuiltGui.Dialog].component).toBe(VueDialog);
    expect((gui as any).gui()[PrebuiltGui.Dialog]).toBeUndefined();
    expect(gui.getVueGuis().filter(item => item.name === PrebuiltGui.Dialog)).toHaveLength(1);

    gui.display(PrebuiltGui.Dialog, { text: "Hello" });
    expect(bridge.updateGuiState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: PrebuiltGui.Dialog,
        display: true,
        data: { text: "Hello" },
      }),
    );

    gui.hide(PrebuiltGui.Dialog);
    expect(bridge.updateGuiState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: PrebuiltGui.Dialog,
        display: false,
      }),
    );
  });

  test("allows CanvasEngine GUI entries to replace Vue GUI entries with the same id", async () => {
    const { gui } = await createGui();
    const bridge = {
      updateGuiState: vi.fn(),
      initializeGuiStates: vi.fn(),
    };

    gui._setVueGuiInstance(bridge);
    gui.add({
      id: PrebuiltGui.Dialog,
      component: VueDialog,
    });
    gui.add({
      id: PrebuiltGui.Dialog,
      component: CanvasGui,
    });

    expect(gui.get(PrebuiltGui.Dialog)?.component).toBe(CanvasGui);
    expect(gui.getVueGuis().some(item => item.name === PrebuiltGui.Dialog)).toBe(false);
    expect((gui as any).gui()[PrebuiltGui.Dialog].component).toBe(CanvasGui);
    expect(bridge.initializeGuiStates).toHaveBeenLastCalledWith([]);
  });

  test("keeps main menu optimistic reducers when a Vue GUI replaces the prebuilt component", async () => {
    const { gui, socket } = await createGui();
    const bridge = {
      updateGuiState: vi.fn(),
      initializeGuiStates: vi.fn(),
    };

    gui.add({
      id: PrebuiltGui.MainMenu,
      component: VueMainMenu,
    });
    gui._setVueGuiInstance(bridge);
    gui.display(PrebuiltGui.MainMenu, {
      items: [
        {
          id: "potion",
          quantity: 2,
        },
      ],
    });

    gui.guiInteraction(PrebuiltGui.MainMenu, "useItem", { id: "potion" });

    expect(gui.get(PrebuiltGui.MainMenu)?.data().items).toEqual([
      {
        id: "potion",
        quantity: 1,
      },
    ]);
    expect(bridge.updateGuiState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: PrebuiltGui.MainMenu,
        data: {
          items: [
            {
              id: "potion",
              quantity: 1,
            },
          ],
        },
      }),
    );
    expect(socket.emit).toHaveBeenCalledWith(
      "gui.interaction",
      expect.objectContaining({
        guiId: PrebuiltGui.MainMenu,
        name: "useItem",
      }),
    );
  });
});
