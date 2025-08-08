import { createServer, Move, provideServerModules, RpgMap, RpgPlayer, DialogPosition } from "@rpgjs/server";

export function Event() {
  return {
    name: "EV-1",
    onInit() {
      this.setGraphic("hero");
    },
    async onAction(player: RpgPlayer) {
      player.gold = 100;
      await player.showChoices("Hello World Hello World Hello World Hello World Hello World", [{
        text: "yes",
        value: "yes"
      }, {
        text: "no",
        value: "no"
      }], {
        talkWith: this,
        face: {
          id: "facesetId",
          expression: "happy"
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
          async onConnected(player: RpgPlayer) {
             await player.changeMap("simplemap");
            // console.log(player.conn?.state)
          },
          onJoinMap: (player: RpgPlayer, map: RpgMap) => {
            console.log(player.name())
            player.teleport({
              x: 1000,
              y: 400,
            });
            player.setGraphic("hero");
          },
          async onInput(player: RpgPlayer, input: any) {
            if (input.action) {
            //  player.wood.update(wood => wood + 1)
            //  player.showComponentAnimation('wood')
              // player.name.set('test')
              player.name.set('test')
              await player.changeMap("simplemap2");
              
            }
            // if (input.action) {
            //  player.wood.update(wood => wood + 1)
            //  player.showComponentAnimation('wood')
            // }
            if (input.action) {
              //player.gui("RpgComponentExample").open()
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
