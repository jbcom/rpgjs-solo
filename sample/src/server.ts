import { createServer, Move, provideServerModules, RpgPlayer } from "@rpgjs/server";
import { provideTiledMap } from "@rpgjs/tiledmap/server";

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
  ],
});
