import { createServer, Move, provideServerModules, RpgMap, RpgPlayer, DialogPosition, RpgShape, Components, MAXHP, RpgEvent, EventData, EventMode, MapData, Frequency, ATK, PDEF, LocalStorageSaveStorageStrategy, provideAutoSave } from "@rpgjs/server";
import { provideTiledMap } from "@rpgjs/tiledmap/server";
import { Item } from '@rpgjs/database'
import { provideMain } from "./modules/main";
import { Direction } from "@rpgjs/common";
import { provideActionBattle, BattleAi, EnemyType } from "@rpgjs/action-battle/server";
import { provideSaveStorage } from "@rpgjs/server";

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
  icon: 'wood',
};

const BasicArmor = {
  id: 'basic-armor',
  name: 'Basic Armor',
  description: 'A basic armor',
  price: 50,
  pdef: 10,
  _type: 'armor' as const,
  icon: 'armor',
};

const BasicHelmet = {
  id: 'basic-helmet',
  name: 'Basic Helmet',
  description: 'A basic helmet',
  price: 50,
  pdef: 10,
  _type: 'armor' as const,
  icon: 'helmet',
};

const FireArmor = {
  id: 'fire-armor',
  name: 'Fire Armor',
  description: 'A fire armor',
  price: 50,
  pdef: 10,
  _type: 'armor' as const,
  icon: 'fire-armor',
};

const BasicPotion = {
  id: 'basic-potion',
  name: 'Basic Potion',
  description: 'A basic potion',
  price: 10,
  _type: 'item' as const,
  icon: 'potion',
};

const fireSkill = {
  id: 'fire-skill',
  name: 'Fire Skill',
  description: 'A fire skill',
  spCost: 10,
  hitRate: 1,
  power: 50,
  coefficient: { [ATK]: 0, [PDEF]: 0 },
  _type: 'skill' as const,
  // onUse(player: RpgPlayer) {
  //   console.log('Fire spell cast!');
  // }
};

export function Event() {
  return {
    name: "EV-1",
    mode: EventMode.Scenario,
    onInit() {
      this.setGraphic("hero");
      this.speed.set(4)
      this.teleport({ x: 100, y: 200 })
      this.name.set("John Doe");
      
      this.through = false;
      // this.infiniteMoveRoute([
      //   Move.tileRandom()
      // ], {
      //   onStuck: (player, target, currentPos) => {
      //     console.log("stuck");
      //     return true;
      //   }
      // })
      
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
      await player.showText("Hello", {
        face: {
          id: 'facesetId',
          expression: 'happy'
        },
        talkWith: this
      })
      this.setGraphic("monster")
      player.setVariable('questCompleted', true);
      player.gold = 1000;
      await player.callShop({
        items: [BasicSword, HeavyHammer, EnemyClaw, BasicShield],
        message: "Hey !",
        face: {
          id: 'facesetId',
          expression: 'happy'
        }
      })
      await player.showText("Thanks you !", {
        face: {
          id: 'facesetId',
          expression: 'happy'
        },
        talkWith: this
      })
    },
  };
}

export default createServer({
  providers: [
  //  provideTiledMap(),
    provideMain(),
   // provideActionBattle(),


    provideSaveStorage(new LocalStorageSaveStorageStrategy({ key: "save" })),
    provideAutoSave({
      canSave: (player) => true,
      getDefaultSlot: () => 0
    }),

    provideServerModules([
      {
        // Register weapons and armor in database
        database: {
          'basic-sword': BasicSword,
          'heavy-hammer': HeavyHammer,
          'enemy-claw': EnemyClaw,
          'basic-shield': BasicShield,
          'basic-armor': BasicArmor,
          'basic-helmet': BasicHelmet,
          'fire-armor': FireArmor,
        },
        player: {
          props: {
            wood: Number
          },
          onStart: (player: RpgPlayer) => {
            player.changeMap("center-map", {
              x: 200,
              y: 150,
            });
          },
          onLoad: (player: RpgPlayer, data: any) => {
            console.log("load", player.items());
          },
          onSave: (player: RpgPlayer, data: any) => {
            console.log("save");
            console.log(data);
          },
          onJoinMap: (player: RpgPlayer, map: RpgMap) => {
            console.log("join map");
            player.setGraphic("hero");
            
            // Configure player stats
            //player.hp = 200;
            //player.param[MAXHP] = 200;
            player.param[ATK] = 20;
            player.param[PDEF] = 10;
            
            
            player.learnSkill(fireSkill);
            
            console.log("Player equipped with:", player.equipments().map(e => e.name()));
          },
          onLeaveMap: (player: RpgPlayer, map: RpgMap) => {

          },
          async onDead(player: RpgPlayer) {
            const selection = await player.callGameover({
                title: 'Game Over',
                  subtitle: 'Choose your fate',
                  entries: [
                      { id: 'title', label: 'Title Screen' },
                      { id: 'load', label: 'Load Game' }
                  ]
              })
      
              if (selection?.id === 'title') {
                  await player.gui('rpg-title-screen').open()
              }
      
              if (selection?.id === 'load') {
                  await player.showLoad()
              }
          },
          async onInput(player: RpgPlayer, input: any) {
            // console.log("call shop")


            // const choice = await player.showChoices('Hello', [
            //   { text: 'Fight', value: 'fight' },
            //   { text: 'Run away', value: 'run' },
            //   { text: 'Talk', value: 'talk' }
            // ])

            // console.log(choice)
           
           //  player.callShop([BasicSword, HeavyHammer, EnemyClaw, BasicShield])
             // player.hp -= 100;
            
            //  player.callMainMenu({
            //   menus: [
            //     { id: 'items', label: 'Items' },
            //     { id: 'equip', label: 'Equip' },
            //     { id: 'save', label: 'Save' },
            //   ]
            //  })
           if (input.action == 'escape')player.callMainMenu()
           // player.hp -= 100;
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
