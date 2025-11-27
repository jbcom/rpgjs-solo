import { createServer, Move, provideServerModules, RpgMap, RpgPlayer, DialogPosition } from "@rpgjs/server";
import { provideTiledMap } from "@rpgjs/tiledmap/server";

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
  //  provideTiledMap(),
    provideServerModules([
      {
        player: {
          props: {
            wood: Number
          },
          async onConnected(player: RpgPlayer) {
            player.name.set('plop')
            await player.changeMap("map");
            // console.log(player.conn?.state)
          },
          onJoinMap: (player: RpgPlayer, map: RpgMap) => {
            player.setGraphic("hero");
            player.teleport({ x: 100, y: 100 })
          },
          onLeaveMap: (player: RpgPlayer, map: RpgMap) => {

          },
          async onInput(player: RpgPlayer, input: any) {
            console.log(player.x(), player.y())
            if (input.action) {
              //  player.wood.update(wood => wood + 1)
              //  player.showComponentAnimation('wood')
              // player.name.set('test')
              const event = player.getCurrentMap()?.getEvents()[0]
              if (event) {
                event.moveTo(player)
              }

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
            id: "map",
            events: [{ x: 200, y: 200, event: Event() }],
          },
        ],
        worldMaps: [
          {
            id: 'world',
            maps: [
              {
                id: 'map',
                worldX: 0,
                worldY: 640,
                width: 2048,
                height: 2048,
              },
              {
                id: 'simplemap',
                worldX: 0,
                worldY: 0,
                width: 800,
                height: 640,
              }
            ]
          }
        ]
      },
    ])
  ],
});
