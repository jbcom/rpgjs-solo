import { createServer, Move, provideServerModules, RpgMap, RpgPlayer, DialogPosition } from "@rpgjs/server";

export function Event() {
  return {
    name: "EV-1",
    onInit() {
      this.setGraphic("hero");
    },
    async onAction(player: RpgPlayer) {
      player.gold = 100;
      // await player.showChoices("Hello World Hello World Hello World Hello World Hello World", [{
      //   text: "yes",
      //   value: "yes"
      // }, {
      //   text: "no",
      //   value: "no"
      // }], {
      //   talkWith: this,
      //   face: {
      //     id: "facesetId",
      //     expression: "happy"
      //   }
      // });
      player.showText("Hello World")
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
            player.name.set('plop')
             await player.changeMap("simplemap", {
              x: Math.floor(100),
              y: Math.floor(100),
             });
            // console.log(player.conn?.state)
          },
          onJoinMap: (player: RpgPlayer, map: RpgMap) => {
            player.setGraphic("hero");
          },
          onLeaveMap: (player: RpgPlayer, map: RpgMap) => {
           
          },
          async onInput(player: RpgPlayer, input: any) {
            if (input.action) {
            //  player.wood.update(wood => wood + 1)
            //  player.showComponentAnimation('wood')
              // player.name.set('test')
            //   const event = player.getCurrentMap()?.getEvents()[0]
            //  event?.moveTo(player)
              
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
            events: [{x: 200, y: 200, event: Event()}],
          },
        ],
        worldMaps: [
          {
            id: 'world',
            maps: [
              {
                id: 'simplemap',
                worldX: 2048,
                worldY: 0,
                width: 2048,
                height: 2048,
              },
              {
                id: 'simplemap2',
                worldX: 0,
                worldY: 0,
                width: 2048,
                height: 2048,
              }
            ]
          }
        ]
      },
    ])
  ],
});
