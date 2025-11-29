import { createServer, Move, provideServerModules, RpgMap, RpgPlayer, DialogPosition, RpgShape, Components, MAXHP, RpgEvent, EventData, EventMode } from "@rpgjs/server";
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

@EventData({
  name: 'EV-1',
  mode: EventMode.Scenario
})
export class CharaEvent extends RpgEvent {
  onInit(player: RpgPlayer) {
    this.setGraphic("monster");
  }
  onAction(player: RpgPlayer) {
     
  }
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
            await player.changeMap("map");
            // console.log(player.conn?.state)
          },
          onJoinMap: (player: RpgPlayer, map: RpgMap) => {
            console.log("join map");
            player.setGraphic("hero");
            
            // Initialize HP for testing the HP bar component
            player.addParameter(MAXHP, { start: 100, end: 500 });
            player.hp = 80; // Start with 80% HP to demonstrate the bar
            
            player.teleport({ x: 100, y: 100 }); 
          },
          onLeaveMap: (player: RpgPlayer, map: RpgMap) => {

          },
          async onInput(player: RpgPlayer, input: any) {
            console.log(player.x(), player.y())
            if (input.action) {
              console.log("action");
              player.gui('my-tooltip').open()
              player.showAttachedGui()
            }
          } 
        },
        maps: [
          {
            id: "map",
            events: [{ event: Event() }],
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
      }
    ])
  ],
});
