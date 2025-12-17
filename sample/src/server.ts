import { createServer, Move, provideServerModules, RpgMap, RpgPlayer, DialogPosition, RpgShape, Components, MAXHP, RpgEvent, EventData, EventMode, MapData, Frequency, ATK, PDEF } from "@rpgjs/server";
import { provideTiledMap } from "@rpgjs/tiledmap/server";
import { Item } from '@rpgjs/database'
import { provideMain } from "./modules/main";
import { Direction } from "@rpgjs/common";
import { provideActionBattle, BattleAi, EnemyType } from "@rpgjs/action-battle/server";

/**
 * Basic Sword weapon
 * 
 * A standard sword with moderate attack power and knockback.
 */
const BasicSword = {
  id: 'basic-sword',
  name: 'Basic Sword',
  description: 'A simple iron sword',
  price: 100,
  atk: 15,
  knockbackForce: 40,
  _type: 'weapon' as const,
};

/**
 * Heavy Hammer weapon
 * 
 * A powerful hammer with high knockback but slower attack.
 */
const HeavyHammer = {
  id: 'heavy-hammer',
  name: 'Heavy Hammer',
  description: 'A massive war hammer with devastating knockback',
  price: 250,
  atk: 25,
  knockbackForce: 80,
  _type: 'weapon' as const,
};

/**
 * Enemy Claw weapon
 * 
 * Natural weapon for enemies with low knockback.
 */
const EnemyClaw = {
  id: 'enemy-claw',
  name: 'Sharp Claws',
  description: 'Natural claws for slashing',
  price: 0,
  atk: 10,
  knockbackForce: 30,
  _type: 'weapon' as const,
};

/**
 * Basic Shield armor
 * 
 * Simple protective equipment.
 */
const BasicShield = {
  id: 'basic-shield',
  name: 'Wooden Shield',
  description: 'A basic wooden shield',
  price: 50,
  pdef: 10,
  _type: 'armor' as const,
};

export function Event() {
  return {
    name: "EV-1",
    mode: EventMode.Scenario,
    onInit() {
      this.setGraphic("hero");
      this.speed.set(1)
      this.teleport({ x: 100, y: 200 })
      this.frequency = Frequency.Low;
      this.through = false;
      
      // Configure enemy stats
      this.hp = 1000;
      this.param[MAXHP] = 1000;
      this.param[ATK] = 10;
      this.param[PDEF] = 5;
      
      // Equip enemy weapon
      this.addItem(EnemyClaw);
      this.equip(EnemyClaw.id);
      
      // Initialize AI behavior
      // this.battleAi = new BattleAi(this, {
      //   enemyType: EnemyType.Aggressive,
      //   visionRange: 150,
      //   attackRange: 50,
      // });
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
    provideActionBattle(),
    provideServerModules([
      {
        // Register weapons and armor in database
        database: {
          'basic-sword': BasicSword,
          'heavy-hammer': HeavyHammer,
          'enemy-claw': EnemyClaw,
          'basic-shield': BasicShield,
        },
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
            
            // Configure player stats
            player.hp = 200;
            player.param[MAXHP] = 200;
            player.param[ATK] = 20;
            player.param[PDEF] = 10;
            
            // Equip player with weapon and armor
            player.addItem(HeavyHammer);
            player.equip(HeavyHammer.id);
            player.addItem(BasicShield);
            player.equip(BasicShield.id);
            
            console.log("Player equipped with:", player.equipments().map(e => e.name()));
          },
          onLeaveMap: (player: RpgPlayer, map: RpgMap) => {

          },
          async onInput(player: RpgPlayer, input: any) {
            
            // const map = player.getCurrentMap()
            // const event =map?.getEventBy(event => event.name() === "EV-1")
            // console.log(event)
            // event!.animationFixed = true 
            
            // event!.changeDirection(Direction.Left)
            // event!.directionFixed = true
            // event!.knockback({ x: 100, y: 1 }, 100)
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
