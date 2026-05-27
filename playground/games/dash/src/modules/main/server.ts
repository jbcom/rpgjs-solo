import { defineModule } from "@rpgjs/common";
import type { RpgPlayerHooks, RpgServer } from "@rpgjs/server";
import { Components, RpgPlayer } from "@rpgjs/server";

const MAP_WIDTH = 720;
const MAP_HEIGHT = 480;
const MAP_HITBOXES = [
  { id: "top-wall", x: 32, y: 32, width: 656, height: 2 },
  { id: "bottom-wall", x: 32, y: 446, width: 656, height: 2 },
  { id: "left-wall", x: 32, y: 32, width: 2, height: 416 },
  { id: "right-wall", x: 686, y: 32, width: 2, height: 416 },
];

const player: RpgPlayerHooks = {
  onConnected(player: RpgPlayer) {
    player.name = "Dash Tester";
    player.setGraphic("hero");
    player.initializeDefaultStats();
    player.changeMap("dash-map", { x: 120, y: 240 });
  },

  onJoinMap(player: RpgPlayer) {
    player.setComponentsTop([
      Components.text("{name}"),
      Components.text("Shift = dash"),
    ]);
  },
};

export default defineModule<RpgServer>({
  player,
  maps: [
    {
      id: "dash-map",
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      hitboxes: MAP_HITBOXES,
    },
  ],
});
