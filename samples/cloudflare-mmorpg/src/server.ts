import {
  createServer,
  provideServerModules,
  type EventDefinition,
  type RpgPlayer,
} from "@rpgjs/server";

function TestNpc(): EventDefinition {
  return {
    onInit() {
      this.name = "Cloudflare NPC";
      this.setGraphic("hero");
    },
  };
}

export default createServer({
  providers: [
    provideServerModules([
      {
        player: {
          async onConnected(player: RpgPlayer) {
            player.initializeDefaultStats();
            player.name = "Cloudflare Hero";
            await player.changeMap("demo", { x: 400, y: 300 });
          },
        },
        maps: [
          {
            id: "demo",
            file: "src/tiled/demo.tmx",
            onJoin(player: RpgPlayer) {
              player.setGraphic("hero");
            },
            events: [
              {
                id: "EV-1",
                x: 520,
                y: 320,
                event: TestNpc(),
              },
            ],
          },
        ],
      },
    ]),
  ],
});
