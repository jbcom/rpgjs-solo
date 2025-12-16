import { createServer, Move, provideServerModules, RpgMap, RpgPlayer, DialogPosition, RpgShape, Components, MAXHP, RpgEvent, EventData, EventMode, MapData } from "@rpgjs/server";
import { provideTiledMap } from "@rpgjs/tiledmap/server";
import { Item } from '@rpgjs/database'
import { provideMain } from "./modules/main";

export function Event() {
  return {
    name: "EV-1",
    mode: EventMode.Scenario,
    onInit() {
      this.setGraphic("hero");
      this.teleport({ x: 200, y: 200 })
    },
    onPlayerTouch(player: RpgPlayer) {
     console.log("touch");
    },
    async onAction(player: RpgPlayer) {
      player.gold = 100;
      this.setGraphic("monster")
    },
  };
}

export default createServer({
  providers: [
  //  provideTiledMap(),
    provideMain(),
    provideServerModules([
      {
        player: {
          props: {
            wood: Number
          },
          async onConnected(player: RpgPlayer) {
            player.name.set('plop')
            await player.changeMap("center-map", {
              x: 200,
              y: 150,
            });
            // console.log(player.conn?.state)
          },
          onJoinMap: (player: RpgPlayer, map: RpgMap) => {
            console.log("join map");
            player.setGraphic("hero");
            
          },
          onLeaveMap: (player: RpgPlayer, map: RpgMap) => {

          },
          async onInput(player: RpgPlayer, input: any) {
            const map = player.getCurrentMap()
            // map?.shakeMap({
            //   intensity: 10,
            //   duration: 1000,
            //   frequency: 10,
            //   direction: 'x',
            // })
            //console.log(player.x(), player.y())
          } 
        },
        maps: [
          {
            id: 'center-map',
            events: [{ event: Event() }]
          }
        ],
        worldMaps: [
          { 
            id: 'world',
            maps: [
              {
                id: 'center-map',
                worldX: 500,
                worldY: 500,
                width: 500,
                height: 500,
              },
              {
                id: 'left-map',
                worldX: 0,
                worldY: 500,
                width: 500,
                height: 500,
              },
              {
                id: 'right-map',
                worldX: 1000,
                worldY: 500,
                width: 500,
                height: 500,
              },
              {
                id: 'top-map',
                worldX: 500,
                worldY: 0,
                width: 500,
                height: 500,
              },
              {
                id: 'bottom-map',
                worldX: 500,
                worldY: 1000,
                width: 500,
                height: 500,
              },
            ]
          }
        ]
      }
    ])
  ],
});
