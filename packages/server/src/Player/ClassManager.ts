import { Constructor, isString, PlayerCtor, RpgCommonPlayer } from "@rpgjs/common";

type ClassClass = any;
type ActorClass = any;

interface PlayerWithMixins extends RpgCommonPlayer {
  databaseById(id: string): any;
  addParameter(name: string, { start, end }: { start: number, end: number }): void;
  addItem(item: any): void;
  equip(item: any, equip: boolean): void;
}

/**
 * Class Manager Mixin
 * 
 * Provides class and actor management capabilities to any class. This mixin handles
 * character class assignment and actor setup, including automatic parameter configuration,
 * starting equipment, and skill progression based on class definitions.
 * 
 * @param Base - The base class to extend with class management
 * @returns Extended class with class management methods
 * 
 * @example
 * ```ts
 * class MyPlayer extends WithClassManager(BasePlayer) {
 *   constructor() {
 *     super();
 *     // Class system is automatically initialized
 *   }
 * }
 * 
 * const player = new MyPlayer();
 * player.setClass(Fighter);
 * player.setActor(Hero);
 * ```
 */
export function WithClassManager<TBase extends PlayerCtor>(Base: TBase) {
  return class extends Base {

    /**
     * Assign a class to the player
     *
     * Sets the player's class, which defines their combat abilities, stat growth,
     * and available skills. The class system provides the foundation for character
     * progression and specialization. When a class is set, it automatically triggers
     * the class's onSet method for any additional initialization.
     * 
     * @param _class - The class constructor or class ID to assign to the player
     * @returns The instantiated class object
     * 
     * @example
     * ```ts
     * import { Fighter } from 'my-database/classes/fighter'
     *
     * // Set class using constructor
     * const fighterClass = player.setClass(Fighter);
     * console.log('Class set:', fighterClass.name);
     * 
     * // Set class using string ID
     * player.setClass('fighter');
     * 
     * // Class affects available skills and stats
     * console.log('Available skills:', player.skills);
     * console.log('Class bonuses applied to stats');
     * 
     * // Class determines level progression
     * player.level = 5;
     * // Skills may be automatically learned based on class definition
     * ```
     */
    setClass(_class: ClassClass | string) {
      if (isString(_class)) _class = (this as any).databaseById(_class);
      const classInstance = new (_class as ClassClass)();
      (this as any)["execMethod"]("onSet", [this], classInstance);
      return classInstance;
    }

    /**
     * Allows to give a set of already defined properties to the player (default equipment, or a list of skills to learn according to the level)
     *
     * Sets up the player as a specific actor archetype, which includes predefined
     * characteristics like starting equipment, parameters, level ranges, and associated class.
     * This is typically used for creating pre-configured character templates or NPCs
     * with specific roles and equipment loadouts.
     * 
     * @param actorClass - The actor constructor or actor ID to assign to the player
     * @returns The instantiated actor object
     * 
     * @example
     * ```ts
     * import { Hero } from 'my-database/classes/hero'
     *
     * // Set up player as Hero actor
     * const heroActor = player.setActor(Hero);
     * console.log('Actor configured:', heroActor.name);
     * 
     * // Actor automatically sets up:
     * // - Starting equipment (sword, armor, etc.)
     * console.log('Starting equipment:', player.equipments());
     * 
     * // - Parameter ranges and growth
     * console.log('Level range:', player.initialLevel, '-', player.finalLevel);
     * 
     * // - Associated class
     * console.log('Assigned class:', player.class);
     * 
     * // - Experience curve
     * console.log('EXP curve:', player.expCurve);
     * 
     * // Actor setup is comprehensive
     * player.setActor('hero'); // Can also use string ID
     * ```
     */
    setActor(actorClass: ActorClass | string) {
      if (isString(actorClass)) actorClass = (this as any).databaseById(actorClass);
      const actor = new (actorClass as ActorClass)();
      ["name", "initialLevel", "finalLevel", "expCurve"].forEach((key) => {
        if (actor[key]) (this as any)[key] = actor[key];
      });
      for (let param in actor.parameters) {
        (this as any).addParameter(param, actor.parameters[param]);
      }
      for (let item of actor.startingEquipment) {
        (this as any).addItem(item);
        (this as any).equip(item, true);
      }
      if (actor.class) this.setClass(actor.class);
      (this as any)["execMethod"]("onSet", [this], actor);
      return actor;
    }
  } as unknown as TBase;
}

/**
 * Type helper to extract the interface from the WithClassManager mixin
 * This provides the type without duplicating method signatures
 */
export type IClassManager = InstanceType<ReturnType<typeof WithClassManager>>;
