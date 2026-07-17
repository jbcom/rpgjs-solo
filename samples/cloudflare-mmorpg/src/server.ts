import {
  createServer,
  provideServerModules,
  type RpgPlayer,
} from "@rpgjs/server";

export default createServer({
  providers: [
    provideServerModules([
      {
        player: {
          async onConnected(player: RpgPlayer) {
            player.initializeDefaultStats();
            await player.changeMap("demo", { x: 160, y: 160 });
          },
        },
        maps: [
          {
            id: "demo",
            file: "src/tiled/demo.tmx",
            events: [],
          },
        ],
      },
    ]),
  ],
});
