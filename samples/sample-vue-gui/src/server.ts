import {
  Components,
  createServer,
  provideServerModules,
  RpgPlayer,
  type RpgPlayerHooks,
} from "@rpgjs/server";

const inventoryItems = [
  { id: "potion", name: "Potion", quantity: 3, description: "Restores 50 HP" },
  { id: "ether", name: "Ether", quantity: 1, description: "Restores 20 SP" },
  { id: "key", name: "Copper Key", quantity: 1, description: "Opens the north gate" },
];

const player: RpgPlayerHooks = {
  onConnected(player: RpgPlayer) {
    player.name.set("Vue Hero");
    player.changeMap("vue-gui-map", {
      x: 220,
      y: 180,
    });
  },
  async onJoinMap(player: RpgPlayer) {
    player.setComponentsTop([
      Components.text("{name}"),
    ]);
    player.showAttachedGui();
    player.gui("vue-hud").open({
      title: "Vue GUI Sample",
      hint: "Action: inventory, Escape: quest log",
    });
  },
  async onInput(player: RpgPlayer, { action }) {
    if (action === "action") {
      const inventory = player.gui("vue-inventory");
      inventory.on("use-item", (data) => {
        const item = inventoryItems.find((entry) => entry.id === data.itemId);
        inventory.update({
          items: inventoryItems,
          message: item ? `${item.name} selected on the server` : "Unknown item",
        }, {
          clientActionId: data.clientActionId,
        });
      });
      await inventory.open({
        items: inventoryItems,
        message: "Choose an item. The click is handled on the server.",
      });
    }

    if (action === "escape") {
      await player.gui("vue-quest-log").open({
        quests: [
          { id: "intro", label: "Inspect the Vue overlay", done: true },
          { id: "inventory", label: "Open the inventory with Action", done: false },
          { id: "tooltip", label: "Check the nameplate attached to the player", done: false },
        ],
      });
    }
  },
};

export default createServer({
  providers: [
    provideServerModules([
      {
        player,
        maps: [
          {
            id: "vue-gui-map",
          },
        ],
      },
    ]),
  ],
});
