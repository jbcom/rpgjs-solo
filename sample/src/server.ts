import { createServer, Move, provideServerModules, RpgMap, RpgPlayer, effect } from "@rpgjs/server";

export function Event() {
  return {
    name: "EV-1",
    onInit() {
      this.setGraphic("hero");
    },
    async onAction(player: RpgPlayer) {
      player.gold = 100;
      await player.showText("Hello World Hello World Hello World Hello World Hello World", {
        talkWith: this,
        face: {
          id: "facesetId",
          expression: "happy"
        }
      });
      await player.showText("ok", {
        talkWith: this,
        face: {
          id: "facesetId",
          expression: "sad"
        }
      });
    },
  };
}

export default createServer({
  providers: [
    provideServerModules([
      {
        player: {
          props: {
            wood: Number
          },
          onConnected: async (player: RpgPlayer) => {
            
            player.changeMap("simplemap");
          },
          onJoinMap: (player: RpgPlayer, map: RpgMap) => {
            player.teleport({
              x: 1000,
              y: 400,
            });
            player.setGraphic("hero");
          },
          onInput(player: RpgPlayer, input: any) {
            if (input.action) {
            //  player.wood.update(wood => wood + 1)
            //  player.showComponentAnimation('wood')
            
            }
          }
        },
        maps: [
          {
            id: "simplemap",
            events: [{x: 1000, y: 600, event: Event()}],
          },
        ],
      },
    ])
  ],
});
