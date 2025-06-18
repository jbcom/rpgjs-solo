import { isInstanceOf, isString, Item, PlayerCtor, type Constructor } from "@rpgjs/common";
import { RpgCommonPlayer, Matter } from "@rpgjs/common";
import { ATK, PDEF, SDEF } from "../presets";
import { ItemLog } from "../logs";
import { ArmorInstance, ItemClass, ItemInstance, WeaponInstance } from "@rpgjs/database";

// Ajout des enums manquants
enum Effect {
  CAN_NOT_ITEM = 'CAN_NOT_ITEM'
}

enum ClassHooks {
  canEquip = 'canEquip'
}

type Inventory = { nb: number; item: ItemInstance };

/**
 * Item Manager Mixin
 *
 * Provides comprehensive item management capabilities to any class. This mixin handles
 * inventory management, item usage, equipment, buying/selling, and item effects.
 * It manages the complete item system including restrictions, transactions, and equipment.
 *
 * @param Base - The base class to extend with item management
 * @returns Extended class with item management methods
 * 
 * @example
 * ```ts
 * class MyPlayer extends WithItemManager(BasePlayer) {
 *   constructor() {
 *     super();
 *     // Item system is automatically initialized
 *   }
 * }
 * 
 * const player = new MyPlayer();
 * player.addItem('potion', 5);
 * player.useItem('potion');
 * ```
 */
export function WithItemManager<TBase extends PlayerCtor>(Base: TBase) {
  return class extends Base {

    /**
     * Retrieves the information of an object: the number and the instance
     * @title Get Item
     * @method player.getItem(itemClass)
     * @param {ItemClass | string} itemClass Identifier of the object if the parameter is a string
     * @returns {{ nb: number, item: instance of ItemClass }}
     * @memberof ItemManager
     * @example
     *
     * ```ts
     * import Potion from 'your-database/potion'
     *
     * player.addItem(Potion, 5)
     * const inventory = player.getItem(Potion)
     * console.log(inventory) // { nb: 5, item: <instance of Potion> }
     *  ```
     */
    getItem(itemClass: ItemClass | string): Item {
      const index: number = this._getItemIndex(itemClass);
      return (this as any).items()[index];
    }

    /**
     * Check if the player has the item in his inventory.
     * @title Has Item
     * @method player.hasItem(itemClass)
     * @param {ItemClass | string} itemClass Identifier of the object if the parameter is a string
     * @returns {boolean}
     * @memberof ItemManager
     * @example
     *
     * ```ts
     * import Potion from 'your-database/potion'
     *
     * player.hasItem(Potion) // false
     *  ```
     */
    hasItem(itemClass: ItemClass | string): boolean {
      return !!this.getItem(itemClass);
    }

    _getItemIndex(itemClass: ItemClass | string): number {
      return (this as any).items().findIndex((it: Item): boolean => {
        if (isString(itemClass)) {
          return it.id() == itemClass;
        }
        return isInstanceOf(it, itemClass);
      });
    }
    /**
     * Add an item in the player's inventory. You can give more than one by specifying `nb`
     *
     * `onAdd()` method is called on the ItemClass
     *
     * @title Add Item
     * @method player.addItem(item,nb=1)
     * @param {ItemClass} itemClass
     * @param {number} [nb] Default 1
     * @returns {{ nb: number, item: instance of ItemClass }}
     * @memberof ItemManager
     * @example
     *
     * ```ts
     * import Potion from 'your-database/potion'
     * player.addItem(Potion, 5)
     *  ```
     */
    addItem(itemId: string, nb: number = 1): Item {
      const data = (this as any).databaseById(itemId);
      const item = (this as any).items().find((it) => it.id() == itemId);
      let instance: Item;
      if (item) {
        instance = item;
        instance.quantity.update((it) => it + nb);
      } else {
        instance = new Item(data);
        instance.id.set(itemId);
        (this as any).items().push(instance);
      }
      (this as any)["execMethod"]("onAdd", [this], instance);
      return instance;
    }

    /**
     * Deletes an item. Decreases the value `nb`. If the number falls to 0, then the item is removed from the inventory. The method then returns `undefined`
     *
     * `onRemove()` method is called on the ItemClass
     *
     * @title Remove Item
     * @method player.removeItem(item,nb=1)
     * @param {ItemClass | string} itemClass string is item id
     * @param {number} [nb] Default 1
     * @returns {{ nb: number, item: instance of ItemClass } | undefined}
     * @throws {ItemLog} notInInventory
     * If the object is not in the inventory, an exception is raised
     *  ```
     * {
     *      id: ITEM_NOT_INVENTORY,
     *      msg: '...'
     * }
     * ```
     * @memberof ItemManager
     * @example
     *
     * ```ts
     * import Potion from 'your-database/potion'
     *
     * try {
     *    player.removeItem(Potion, 5)
     * }
     * catch (err) {
     *    console.log(err)
     * }
     * ```
     */
    removeItem(
      itemClass: ItemClass | string,
      nb: number = 1
    ): Item | undefined {
      const itemIndex: number = this._getItemIndex(itemClass);
      if (itemIndex == -1) {
        throw ItemLog.notInInventory(itemClass);
      }
      const currentNb: number = this.items()[itemIndex].quantity();
      const item = this.items()[itemIndex];
      if (currentNb - nb <= 0) {
        this.items().splice(itemIndex, 1);
      } else {
        this.items()[itemIndex].quantity.update((it) => it - nb);
      }
      this["execMethod"]("onRemove", [this], item);
      return this.items()[itemIndex];
    }

    /**
     * Purchases an item and reduces the amount of gold
     *
     * `onAdd()` method is called on the ItemClass
     *
     * @title Buy Item
     * @method player.buyItem(item,nb=1)
     * @param {ItemClass | string} itemClass string is item id
     * @param {number} [nb] Default 1
     * @returns {{ nb: number, item: instance of ItemClass }}
     * @throws {ItemLog} haveNotPrice
     * If you have not set a price on the item
     *  ```
     * {
     *      id: NOT_PRICE,
     *      msg: '...'
     * }
     * ```
     * @throws {ItemLog} notEnoughGold
     * If the player does not have enough money
     *  ```
     * {
     *      id: NOT_ENOUGH_GOLD,
     *      msg: '...'
     * }
     * ```
     * @memberof ItemManager
     * @example
     *
     * ```ts
     * import Potion from 'your-database/potion'
     *
     * try {
     *    player.buyItem(Potion)
     * }
     * catch (err) {
     *    console.log(err)
     * }
     * ```
     */
    buyItem(itemId: string, nb = 1): Item {
      const data = (this as any).databaseById(itemId);
      if (!data.price) {
        throw ItemLog.haveNotPrice(itemId);
      }
      const totalPrice = nb * data.price;
      if (this._gold() < totalPrice) {
        throw ItemLog.notEnoughGold(itemId, nb);
      }
      this._gold.update((gold) => gold - totalPrice);
      return this.addItem(itemId, nb);
    }

    /**
     * Sell an item and the player wins the amount of the item divided by 2
     *
     * `onRemove()` method is called on the ItemClass
     *
     * @title Sell Item
     * @method player.sellItem(item,nb=1)
     * @param {ItemClass | string} itemClass string is item id
     * @param {number} [nbToSell] Default 1
     * @returns {{ nb: number, item: instance of ItemClass }}
     * @throws {ItemLog} haveNotPrice
     * If you have not set a price on the item
     *   ```
     * {
     *      id: NOT_PRICE,
     *      msg: '...'
     * }
     * ```
     * @throws {ItemLog} notInInventory
     * If the object is not in the inventory, an exception is raised
     *  ```
     * {
     *      id: ITEM_NOT_INVENTORY,
     *      msg: '...'
     * }
     * ```
     * @throws {ItemLog} tooManyToSell
     * If the number of items for sale exceeds the number of actual items in the inventory
     *  ```
     * {
     *      id: TOO_MANY_ITEM_TO_SELL,
     *      msg: '...'
     * }
     * ```
     * @memberof ItemManager
     * @example
     *
     * ```ts
     * import Potion from 'your-database/potion'
     *
     * try {
     *     player.addItem(Potion)
     *     player.sellItem(Potion)
     * }
     * catch (err) {
     *    console.log(err)
     * }
     * ```
     */
    sellItem(itemId: string, nbToSell = 1): Item {
      const data = (this as any).databaseById(itemId);
      const inventory = this.getItem(itemId);
      if (!inventory) {
        throw ItemLog.notInInventory(itemId);
      }
      const quantity = inventory.quantity();
      if (quantity - nbToSell < 0) {
        throw ItemLog.tooManyToSell(itemId, nbToSell, quantity);
      }
      if (!data.price) {
        throw ItemLog.haveNotPrice(itemId);
      }
      this._gold.update((gold) => gold + (data.price / 2) * nbToSell);
      this.removeItem(itemId, nbToSell);
      return inventory;
    }

    getParamItem(name: string): number {
      let nb = 0;
      for (let item of this.equipments()) {
        nb += item[name] || 0;
      }
      const modifier = (this as any).paramsModifier?.[name];
      if (modifier) {
        if (modifier.value) nb += modifier.value;
        if (modifier.rate) nb *= modifier.rate;
      }
      return nb;
    }

    /**
     * recover the attack sum of items equipped on the player.
     *
     * @title Get the player's attack
     * @prop {number} player.atk
     * @memberof ItemManager
     */
    get atk(): number {
      return this.getParamItem(ATK);
    }

    /**
     * recover the physic defense sum of items equipped on the player.
     *
     * @title Get the player's pdef
     * @prop {number} player.pdef
     * @memberof ItemManager
     */
    get pdef(): number {
      return this.getParamItem(PDEF);
    }

    /**
     * recover the skill defense sum of items equipped on the player.
     *
     * @title Get the player's sdef
     * @prop {number} player.sdef
     * @memberof ItemManager
     */
    get sdef(): number {
      return this.getParamItem(SDEF);
    }

    /**
     *  Use an object. Applies effects and states. Removes the object from the inventory then
     *
     * `onUse()` method is called on the ItemClass (If the use has worked)
     * `onRemove()` method is called on the ItemClass
     *
     * @title Use an Item
     * @method player.useItem(item,nb=1)
     * @param {ItemClass | string} itemClass string is item id
     * @returns {{ nb: number, item: instance of ItemClass }}
     * @throws {ItemLog} restriction
     * If the player has the `Effect.CAN_NOT_ITEM` effect
     *   ```
     * {
     *      id: RESTRICTION_ITEM,
     *      msg: '...'
     * }
     * ```
     * @throws {ItemLog} notInInventory
     * If the object is not in the inventory, an exception is raised
     *  ```
     * {
     *      id: ITEM_NOT_INVENTORY,
     *      msg: '...'
     * }
     * ```
     * @throws {ItemLog} notUseItem
     * If the `consumable` property is on false
     *  ```
     * {
     *      id: NOT_USE_ITEM,
     *      msg: '...'
     * }
     * ```
     * @throws {ItemLog} chanceToUseFailed
     * Chance to use the item has failed. Chances of use is defined with `ItemClass.hitRate`
     *  ```
     * {
     *      id: USE_CHANCE_ITEM_FAILED,
     *      msg: '...'
     * }
     * ```
     * > the item is still deleted from the inventory
     *
     * `onUseFailed()` method is called on the ItemClass
     *
     * @memberof ItemManager
     * @example
     *
     * ```ts
     * import Potion from 'your-database/potion'
     *
     * try {
     *     player.addItem(Potion)
     *     player.useItem(Potion)
     * }
     * catch (err) {
     *    console.log(err)
     * }
     * ```
     */
    useItem(itemId: string): Item {
      const inventory = this.getItem(itemId);
      if ((this as any).hasEffect?.(Effect.CAN_NOT_ITEM)) {
        throw ItemLog.restriction(itemId);
      }
      if (!inventory) {
        throw ItemLog.notInInventory(itemId);
      }
      const item = inventory;
      if ((item as any).consumable === false) {
        throw ItemLog.notUseItem(itemId);
      }
      const hitRate = (item as any).hitRate ?? 1;
      if (Math.random() > hitRate) {
        this.removeItem(itemId);
        this["execMethod"]("onUseFailed", [this], item);
        throw ItemLog.chanceToUseFailed(itemId);
      }
      (this as any).applyEffect?.(item);
      (this as any).applyStates?.(this, item);
      this["execMethod"]("onUse", [this], item);
      this.removeItem(itemId);
      return inventory;
    }

    /**
     * Equips a weapon or armor on a player. Think first to add the item in the inventory with the `addItem()` method before equipping the item.
     * 
     * `onEquip()` method is called on the ItemClass
     * 
     * @title Equip Weapon or Armor
     * @method player.equip(itemClass,equip=true)
     * @param {ItemClass | string} itemClass string is item id
     * @param {number} [equip] Equip the object if true or un-equipped if false
     * @returns {void}
     * @throws {ItemLog} notInInventory 
     * If the item is not in the inventory
     *  ```
        {
            id: ITEM_NOT_INVENTORY,
            msg: '...'
        }
        ```
     * @throws {ItemLog} invalidToEquiped 
        If the item is not by a weapon or armor
        ```
        {
            id: INVALID_ITEM_TO_EQUIP,
            msg: '...'
        }
        ```
    * @throws {ItemLog} isAlreadyEquiped 
        If the item Is already equipped
        ```
        {
            id: ITEM_ALREADY_EQUIPED,
            msg: '...'
        }
        ```
     * @memberof ItemManager
     * @example
     * 
     * ```ts
     * import Sword from 'your-database/sword'
     * 
     * try {
     *      player.addItem(Sword)
     *      player.equip(Sword)
     * }
     * catch (err) {
     *    console.log(err)
     * }
     * ```
     */
    equip(
      itemId: string,
      equip: boolean = true
    ): void {
      const inventory: Item = this.getItem(itemId);
      if (!inventory) {
        throw ItemLog.notInInventory(itemId);
      }
      const data = (this as any).databaseById(itemId);
      if (data._type == "item") {
        throw ItemLog.invalidToEquiped(itemId);
      }

      if (this._class && this._class()[ClassHooks.canEquip]) {
        const canEquip = this["execMethodSync"](
          ClassHooks.canEquip,
          [inventory, this],
          this._class()
        );
        if (!canEquip) {
          throw ItemLog.canNotEquip(itemId);
        }
      }

      const item = inventory;

      if ((item as any).equipped && equip) {
        throw ItemLog.isAlreadyEquiped(itemId);
      }
      (item as any).equipped = equip;
      if (!equip) {
        const index = this.equipments().findIndex((it) => it.id() == item.id());
        this.equipments().splice(index, 1);
      } else {
        this.equipments().push(item);
      }
      this["execMethod"]("onEquip", [this, equip], item);
    }
  } as unknown as TBase;
}

/**
 * Type helper to extract the interface from the WithItemManager mixin
 * This provides the type without duplicating method signatures
 */
export type IItemManager = InstanceType<ReturnType<typeof WithItemManager>>;
