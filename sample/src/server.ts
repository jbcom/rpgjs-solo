import { createServer, Move, provideServerModules, RpgPlayer } from "@rpgjs/server";
import { provideTiledMap } from "@rpgjs/tiledmap/server";
import { provideLoadMap } from "@rpgjs/client";

export function Event() {
  return {
    name: "EV-1",
    onInit() {
      this.setGraphic("female");
    },
    async onAction(player: RpgPlayer) {
      player.gold = 100;
      player.showText("Hello World", {
        talkWith: this
      });
    },
  };
}

export default createServer({
  providers: [
    provideTiledMap(),
    provideServerModules([
      {
        player: {
          onConnected: (player: RpgPlayer) => {
            player.changeMap("simplemap");
            console.log("player connected", player.id)
          },
          onJoinMap: (player: RpgPlayer) => {
            player.teleport({
              x: 250,
              y: 250,
            });
            player.setGraphic("hero");
          },
        },
        maps: [
          {
            id: "simplemap",
            events: [Event()],
          },
        ],
      },
    ]),
    provideLoadMap(() => {})
  ],
});
