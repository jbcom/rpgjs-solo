import { isInstanceOf, isString, Item, PlayerCtor, type Constructor } from "@rpgjs/common";
import { RpgCommonPlayer, Matter } from "@rpgjs/common";
import { ATK, PDEF, SDEF } from "../presets";
import { ItemLog } from "../logs";
import { ArmorInstance, ItemClass, ItemInstance, WeaponInstance } from "@rpgjs/database";
import { RpgPlayer } from "./Player";

// Ajout des enums manquants
enum Effect {
  CAN_NOT_ITEM = 'CAN_NOT_ITEM'
}

enum ClassHooks {
  canEquip = 'canEquip'
}

type Inventory = { nb: number; item: ItemInstance };

/**
 * Interface defining the hooks that can be implemented on item classes or objects
 * 
 * These hooks are called at specific moments during the item lifecycle:
 * - `onAdd`: When the item is added to the player's inventory
 * - `onUse`: When the item is successfully used
 * - `onUseFailed`: When the item usage fails (e.g., chance roll failed)
 * - `onRemove`: When the item is removed from the inventory
 * - `onEquip`: When the item is equipped or unequipped
 * 
 * @example
 * ```ts
 * const itemHooks: ItemHooks = {
 *   onAdd(player) {
 *     console.log('Item added to inventory');
 *   },
 *   onUse(player) {
 *     player.hp += 100;
 *   }
 * };
 * ```
 */
export interface ItemHooks {
  /**
   * Called when the item is added to the player's inventory
   * 
   * @param player - The player receiving the item
   */
  onAdd?: (player: RpgPlayer) => void | Promise<void>;

  /**
   * Called when the item is successfully used
   * 
   * @param player - The player using the item
   */
  onUse?: (player: RpgPlayer) => void | Promise<void>;

  /**
   * Called when the item usage fails (e.g., chance roll failed)
   * 
   * @param player - The player attempting to use the item
   */
  onUseFailed?: (player: RpgPlayer) => void | Promise<void>;

  /**
   * Called when the item is removed from the inventory
   * 
   * @param player - The player losing the item
   */
  onRemove?: (player: RpgPlayer) => void | Promise<void>;

  /**
   * Called when the item is equipped or unequipped
   * 
   * @param player - The player equipping/unequipping the item
   * @param equip - true if equipping, false if unequipping
   */
  onEquip?: (player: RpgPlayer, equip: boolean) => void | Promise<void>;
}

/**
 * Base properties that can be included in an item object
 * 
 * This interface defines the common properties that items can have.
 * Use this as a base and extend it with specific item types.
 * 
 * @template T - Additional properties specific to the item type
 * 
 * @example
 * ```ts
 * interface PotionData extends ItemData {
 *   hpValue: number;
 *   mpValue: number;
 * }
 * 
 * const potion: ItemObject<PotionData> = {
 *   name: 'Health Potion',
 *   description: 'Restores 100 HP',
 *   price: 200,
 *   hpValue: 100,
 *   mpValue: 0,
 *   onUse(player) {
 *     player.hp += this.hpValue;
 *   }
 * };
 * ```
 */
export interface ItemData {
  /** Item name */
  name?: string;
  /** Item description */
  description?: string;
  /** Item price */
  price?: number;
  /** HP value restored when used */
  hpValue?: number;
  /** MP/SP value restored when used */
  mpValue?: number;
  /** Chance to successfully use the item (0-1) */
  hitRate?: number;
  /** Whether the item is consumable */
  consumable?: boolean;
  /** States to add when used */
  addStates?: any[];
  /** States to remove when used */
  removeStates?: any[];
  /** Elemental properties */
  elements?: any[];
  /** Parameter modifiers */
  paramsModifier?: Record<string, any>;
  /** Item type (for equipment validation) */
  _type?: 'item' | 'weapon' | 'armor';
}

/**
 * Item object type that combines data properties with hooks
 * 
 * This type allows you to create item objects directly without needing a class.
 * The object can contain both item data properties and lifecycle hooks.
 * 
 * @template T - Additional properties specific to the item type (extends ItemData)
 * 
 * @example
 * ```ts
 * const potion: ItemObject = {
 *   name: 'Health Potion',
 *   description: 'Restores 100 HP',
 *   price: 200,
 *   hpValue: 100,
 *   consumable: true,
 *   onAdd(player) {
 *     console.log('Potion added!');
 *   },
 *   onUse(player) {
 *     player.hp += 100;
 *   }
 * };
 * 
 * player.addItem(potion);
 * ```
 */
export type ItemObject<T extends ItemData = ItemData> = T & ItemHooks & {
  /** Item identifier (required if not using class or string) */
  id?: string;
};

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
     * Supports three ways to add items:
     * 1. **String**: Pass a string ID to retrieve the item from the database (requires item to be registered in `@RpgModule` database).
     * 2. **Class**: Pass an item class (e.g., `Potion`). The class will be instantiated and automatically added to the map's database if not already present.
     * 3. **Object**: Pass an item object with properties and hooks directly. The object will be automatically added to the map's database if not already present.
     *
     * For classes and objects, if they don't exist in the database, they are automatically added using `map.addInDatabase()`.
     * This allows dynamic item creation without requiring pre-registration in the module database.
     *
     * `onAdd()` method is called on the ItemClass or ItemObject
     *
     * @title Add Item
     * @method player.addItem(item,nb=1)
     * @param {ItemClass | ItemObject | string} item - Item class, object, or string identifier
     * @param {number} [nb] Default 1
     * @returns {Item} The item instance added to inventory
     * @memberof ItemManager
     * @example
     *
     * ```ts
     * import Potion from 'your-database/potion'
     * 
     * // Using string ID (retrieves from database - item must be in @RpgModule database)
     * player.addItem('Potion', 5)
     * 
     * // Using class (creates instance, auto-adds to map database if not present)
     * player.addItem(Potion, 5)
     * 
     * // Using object directly (auto-adds to map database if not present)
     * player.addItem({
     *   id: 'custom-potion',
     *   name: 'Custom Potion',
     *   description: 'A custom potion',
     *   price: 150,
     *   hpValue: 50,
     *   consumable: true,
     *   onAdd(player) {
     *     console.log('Custom potion added!');
     *   },
     *   onUse(player) {
     *     player.hp += 50;
     *   }
     * }, 3)
     * 
     * // Object without ID (auto-generates ID and adds to database)
     * player.addItem({
     *   name: 'Dynamic Item',
     *   price: 100,
     *   onUse(player) {
     *     console.log('Dynamic item used!');
     *   }
     * })
     *  ```
     */
    addItem(item: ItemClass | ItemObject | string, nb: number = 1): Item {
      const map = (this as any).getCurrentMap();
      if (!map) {
        throw new Error('Player must be on a map to add items');
      }

      let itemId: string;
      let data: any;
      let itemInstance: any = null;

      // Handle string: retrieve from database
      if (isString(item)) {
        itemId = item as string;
        data = (this as any).databaseById(itemId);
        if (!data) {
          throw new Error(
            `The ID=${itemId} data is not found in the database. Add the data in the property "database"`
          );
        }
      }
      // Handle class: create instance and add to database if needed
      else if (typeof item === 'function' || (item as any).prototype) {
        itemId = (item as any).name;
        
        // Check if already in database
        const existingData = map.database()[itemId];
        if (existingData) {
          // Use existing data from database
          data = existingData;
        } else {
          // Add the class to the database (it will be retrieved later via databaseById)
          map.addInDatabase(itemId, item as ItemClass);
          // Use the class as data (it will be used to create Item instance)
          data = item as ItemClass;
        }
        
        // Create instance of the class for hooks
        itemInstance = new (item as ItemClass)();
      }
      // Handle object: use directly and add to database if needed
      else {
        const itemObj = item as ItemObject;
        itemId = itemObj.id || `item-${Date.now()}`;
        
        // Check if already in database
        const existingData = map.database()[itemId];
        if (existingData) {
          // Merge with existing data and force update
          data = { ...existingData, ...itemObj };
          // Update database with merged data (force overwrite)
          map.addInDatabase(itemId, data, { force: true });
        } else {
          // Add the object to the database
          map.addInDatabase(itemId, itemObj);
          // Use object directly as data
          data = itemObj;
        }
        
        itemInstance = itemObj;
      }

      // Find existing item in inventory
      const existingItem = (this as any).items().find((it: Item) => it.id() == itemId);
      let instance: Item;

      if (existingItem) {
        // Item already exists, just update quantity
        instance = existingItem;
        instance.quantity.update((it) => it + nb);
      } else {
        // Create new item instance
        instance = new Item(data);
        instance.id.set(itemId);

        // Attach hooks from class instance or object
        if (itemInstance) {
          // Store the original instance for hook execution
          (instance as any)._itemInstance = itemInstance;
          
          // Attach onAdd hook directly for immediate use
          if (itemInstance.onAdd) {
            instance.onAdd = itemInstance.onAdd.bind(itemInstance);
          }
        };
        (this as any).items().push(instance);
      }

      // Call onAdd hook - use stored instance if available
      const hookTarget = (instance as any)._itemInstance || instance;
      (this as any)["execMethod"]("onAdd", [this], hookTarget);
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
      // Call onRemove hook - use stored instance if available
      const hookTarget = (item as any)._itemInstance || item;
      this["execMethod"]("onRemove", [this], hookTarget);
      return this.items()[itemIndex];
    }

    /**
     * Purchases an item and reduces the amount of gold
     *
     * `onAdd()` method is called on the ItemClass
     *
     * @title Buy Item
     * @method player.buyItem(item,nb=1)
     * @param {ItemClass | string} itemClass Identifier of the object if the parameter is a string
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
     *    // Using class
     *    player.buyItem(Potion)
     *    
     *    // Using string ID
     *    player.buyItem('Potion')
     * }
     * catch (err) {
     *    console.log(err)
     * }
     * ```
     */
    buyItem(item: ItemClass | ItemObject | string, nb = 1): Item {
      let itemId: string;
      let data: any;
      
      if (isString(item)) {
        itemId = item as string;
        data = (this as any).databaseById(itemId);
      } else if (typeof item === 'function' || (item as any).prototype) {
        itemId = (item as any).name;
        data = (this as any).databaseById(itemId);
      } else {
        const itemObj = item as ItemObject;
        itemId = itemObj.id || `item-${Date.now()}`;
        try {
          const dbData = (this as any).databaseById(itemId);
          data = { ...dbData, ...itemObj };
        } catch {
          data = itemObj;
        }
      }
      
      if (!data.price) {
        throw ItemLog.haveNotPrice(itemId);
      }
      const totalPrice = nb * data.price;
      if (this._gold() < totalPrice) {
        throw ItemLog.notEnoughGold(itemId, nb);
      }
      this._gold.update((gold) => gold - totalPrice);
      return this.addItem(item, nb);
    }

    /**
     * Sell an item and the player wins the amount of the item divided by 2
     *
     * `onRemove()` method is called on the ItemClass
     *
     * @title Sell Item
     * @method player.sellItem(item,nb=1)
     * @param {ItemClass | string} itemClass Identifier of the object if the parameter is a string
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
     *     // Using class
     *     player.sellItem(Potion)
     *     // Using string ID
     *     player.sellItem('Potion')
     * }
     * catch (err) {
     *    console.log(err)
     * }
     * ```
     */
    sellItem(itemClass: ItemClass | string, nbToSell = 1): Item {
      const itemId = isString(itemClass) ? itemClass : (itemClass as any).name;
      const data = (this as any).databaseById(itemId);
      const inventory = this.getItem(itemClass);
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
      this.removeItem(itemClass, nbToSell);
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
     * @param {ItemClass | string} itemClass Identifier of the object if the parameter is a string
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
     *     // Using class
     *     player.useItem(Potion)
     *     // Using string ID
     *     player.useItem('Potion')
     * }
     * catch (err) {
     *    console.log(err)
     * }
     * ```
     */
    useItem(itemClass: ItemClass | string): Item {
      const itemId = isString(itemClass) ? itemClass : (itemClass as any).name;
      const inventory = this.getItem(itemClass);
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
      const hookTarget = (item as any)._itemInstance || item;
      if (Math.random() > hitRate) {
        this.removeItem(itemClass);
        this["execMethod"]("onUseFailed", [this], hookTarget);
        throw ItemLog.chanceToUseFailed(itemId);
      }
      (this as any).applyEffect?.(item);
      (this as any).applyStates?.(this, item);
      this["execMethod"]("onUse", [this], hookTarget);
      this.removeItem(itemClass);
      return inventory;
    }

    /**
     * Equips a weapon or armor on a player. Think first to add the item in the inventory with the `addItem()` method before equipping the item.
     * 
     * `onEquip()` method is called on the ItemClass
     * 
     * @title Equip Weapon or Armor
     * @method player.equip(itemClass,equip=true)
     * @param {ItemClass | string} itemClass Identifier of the object if the parameter is a string
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
     *      // Using class
     *      player.equip(Sword)
     *      // Using string ID
     *      player.equip('Sword')
     * }
     * catch (err) {
     *    console.log(err)
     * }
     * ```
     */
    equip(
      itemClass: ItemClass | string,
      equip: boolean = true
    ): void {
      const itemId = isString(itemClass) ? itemClass : (itemClass as any).name;
      const inventory: Item = this.getItem(itemClass);
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
      // Call onEquip hook - use stored instance if available
      const hookTarget = (item as any)._itemInstance || item;
      this["execMethod"]("onEquip", [this, equip], hookTarget);
    }
  } as unknown as TBase;
}

/**
 * Type helper to extract the interface from the WithItemManager mixin
 * This provides the type without duplicating method signatures
 */
export type IItemManager = InstanceType<ReturnType<typeof WithItemManager>>;
