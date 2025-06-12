import { Constructor, isString, RpgCommonPlayer } from "@rpgjs/common";

type ClassClass = any;
type ActorClass = any;

interface PlayerWithMixins extends RpgCommonPlayer {
  databaseById(id: string): any;
  addParameter(name: string, { start, end }: { start: number, end: number }): void;
  addItem(item: any): void;
  equip(item: any, equip: boolean): void;
}

export interface IClassManager {
  setClass(_class: ClassClass | string): ClassClass;
  setActor(actorClass: ActorClass | string): ActorClass;
}

export function WithClassManager<TBase extends Constructor<PlayerWithMixins>>(
  Base: TBase
): Constructor<IClassManager> & TBase {
  return class extends Base implements IClassManager {

    /**
     * Assign a class to the player
     *
     * ```ts
     * import { Fighter } from 'my-database/classes/fighter'
     *
     * player.setClass(Fighter)
     * ```
     *
     * @title Set Class
     * @method player.setClass(ClassClass)
     * @param {ClassClass | string} class class or id
     * @returns {instance of ClassClass}
     * @memberof ClassManager
     * */
    setClass(_class: ClassClass | string) {
      if (isString(_class)) _class = this.databaseById(_class);
      const classInstance = new (_class as ClassClass)();
      this["execMethod"]("onSet", [this], classInstance);
      return classInstance;
    }

    /**
     * Allows to give a set of already defined properties to the player (default equipment, or a list of skills to learn according to the level)
     *
     * ```ts
     * import { Hero } from 'my-database/classes/hero'
     *
     * player.setActor(Hero)
     * ```
     *
     * @title Set Actor
     * @method player.setActor(ActorClass)
     * @param {ActorClass | string} actorClass actor class or id
     * @returns {instance of ActorClass}
     * @memberof ClassManager
     * */
    setActor(actorClass: ActorClass | string) {
      if (isString(actorClass)) actorClass = this.databaseById(actorClass);
      const actor = new (actorClass as ActorClass)();
      ["name", "initialLevel", "finalLevel", "expCurve"].forEach((key) => {
        if (actor[key]) this[key] = actor[key];
      });
      for (let param in actor.parameters) {
        this.addParameter(param, actor.parameters[param]);
      }
      for (let item of actor.startingEquipment) {
        this.addItem(item);
        this.equip(item, true);
      }
      if (actor.class) this.setClass(actor.class);
      this["execMethod"]("onSet", [this], actor);
      return actor;
    }
  };
}
