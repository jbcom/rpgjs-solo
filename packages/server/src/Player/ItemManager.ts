import { isInstanceOf, isString, Item, type PlayerCtor} from "@rpgjs/common";
import { ATK, PDEF, SDEF } from "../presets";
import { ItemLog } from "../logs";
import type { ItemClass, ItemInstance } from "@rpgjs/database";
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

    getItem(itemClass: ItemClass | string): Item {
      const index: number = this._getItemIndex(itemClass);
      return (this as any).items()[index];
    }

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
        instance.quantity.set(nb);

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
      // Only call onAdd if it exists and is a function
      (this as any)["execMethod"]("onAdd", [this], hookTarget);
      return instance;
    }

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
      if (hookTarget && typeof hookTarget.onRemove === 'function') {
        this["execMethod"]("onRemove", [this], hookTarget);
      }
      return this.items()[itemIndex];
    }

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

    get atk(): number {
      return this.getParamItem(ATK);
    }

    get pdef(): number {
      return this.getParamItem(PDEF);
    }

    get sdef(): number {
      return this.getParamItem(SDEF);
    }

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
 * Interface for Item Manager functionality
 * 
 * Provides comprehensive item management capabilities including inventory management,
 * item usage, equipment, buying/selling, and item effects. This interface defines
 * the public API of the ItemManager mixin.
 */
export interface IItemManager {
  /**
   * Retrieves the information of an object: the number and the instance
   * 
   * The returned Item instance contains the quantity information accessible via `quantity()` method.
   * 
   * @param itemClass - Item class or string identifier. If string, it's the item ID
   * @returns Item instance containing quantity and item data
   * 
   * @example
   * ```ts
   * import Potion from 'your-database/potion'
   * 
   * player.addItem(Potion, 5)
   * const inventory = player.getItem(Potion)
   * console.log(inventory.quantity()) // 5
   * console.log(inventory) // <instance of Item>
   * ```
   */
  getItem(itemClass: ItemClass | string): Item;

  /**
   * Check if the player has the item in his inventory
   * 
   * @param itemClass - Item class or string identifier. If string, it's the item ID
   * @returns `true` if player has the item, `false` otherwise
   * 
   * @example
   * ```ts
   * import Potion from 'your-database/potion'
   * 
   * player.hasItem(Potion) // false
   * player.addItem(Potion, 1)
   * player.hasItem(Potion) // true
   * ```
   */
  hasItem(itemClass: ItemClass | string): boolean;

  /**
   * Add an item in the player's inventory
   * 
   * You can add items using:
   * - Item class (automatically registered in database if needed)
   * - Item object (automatically registered in database if needed)
   * - String ID (must be pre-registered in database)
   * 
   * The `onAdd()` method is called on the ItemClass or ItemObject when the item is added.
   * 
   * @param item - Item class, object, or string identifier
   * @param nb - Number of items to add (default: 1)
   * @returns The item instance added to inventory
   * 
   * @example
   * ```ts
   * import Potion from 'your-database/potion'
   * 
   * // Add using class
   * player.addItem(Potion, 5)
   * 
   * // Add using string ID (must be registered in database)
   * player.addItem('Potion', 3)
   * 
   * // Add using object
   * player.addItem({
   *   id: 'custom-potion',
   *   name: 'Custom Potion',
   *   price: 200,
   *   onAdd(player) {
   *     console.log('Custom potion added!')
   *   }
   * }, 2)
   * ```
   */
  addItem(item: ItemClass | ItemObject | string, nb?: number): Item;

  /**
   * Deletes an item from inventory
   * 
   * Decreases the quantity by `nb`. If the quantity falls to 0 or below, the item is removed from the inventory.
   * The method returns `undefined` if the item is completely removed.
   * 
   * The `onRemove()` method is called on the ItemClass when the item is removed.
   * 
   * @param itemClass - Item class or string identifier. If string, it's the item ID
   * @param nb - Number of items to remove (default: 1)
   * @returns Item instance or `undefined` if the item was completely removed
   * @throws {Object} ItemLog.notInInventory - If the item is not in the inventory
   *   - `id`: `ITEM_NOT_INVENTORY`
   *   - `msg`: Error message
   * 
   * @example
   * ```ts
   * import Potion from 'your-database/potion'
   * 
   * try {
   *   player.removeItem(Potion, 5)
   * } catch (err) {
   *   console.log(err) // { id: 'ITEM_NOT_INVENTORY', msg: '...' }
   * }
   * ```
   */
  removeItem(itemClass: ItemClass | string, nb?: number): Item | undefined;

  /**
   * Purchases an item and reduces the amount of gold
   * 
   * The player's gold is reduced by `nb * item.price`. The item is then added to the inventory.
   * The `onAdd()` method is called on the ItemClass when the item is added.
   * 
   * @param item - Item class, object, or string identifier
   * @param nb - Number of items to buy (default: 1)
   * @returns Item instance added to inventory
   * @throws {Object} ItemLog.haveNotPrice - If the item has no price set
   *   - `id`: `NOT_PRICE`
   *   - `msg`: Error message
   * @throws {Object} ItemLog.notEnoughGold - If the player doesn't have enough gold
   *   - `id`: `NOT_ENOUGH_GOLD`
   *   - `msg`: Error message
   * 
   * @example
   * ```ts
   * import Potion from 'your-database/potion'
   * 
   * try {
   *   player.buyItem(Potion)
   * } catch (err) {
   *   if (err.id === 'NOT_ENOUGH_GOLD') {
   *     console.log('Not enough gold!')
   *   } else if (err.id === 'NOT_PRICE') {
   *     console.log('Item has no price!')
   *   }
   * }
   * ```
   */
  buyItem(item: ItemClass | ItemObject | string, nb?: number): Item;

  /**
   * Sell an item and the player wins the amount of the item divided by 2
   * 
   * The player receives `(item.price / 2) * nbToSell` gold. The item is removed from the inventory.
   * The `onRemove()` method is called on the ItemClass when the item is removed.
   * 
   * @param itemClass - Item class or string identifier. If string, it's the item ID
   * @param nbToSell - Number of items to sell (default: 1)
   * @returns Item instance that was sold
   * @throws {Object} ItemLog.haveNotPrice - If the item has no price set
   *   - `id`: `NOT_PRICE`
   *   - `msg`: Error message
   * @throws {Object} ItemLog.notInInventory - If the item is not in the inventory
   *   - `id`: `ITEM_NOT_INVENTORY`
   *   - `msg`: Error message
   * @throws {Object} ItemLog.tooManyToSell - If trying to sell more items than available
   *   - `id`: `TOO_MANY_ITEM_TO_SELL`
   *   - `msg`: Error message
   * 
   * @example
   * ```ts
   * import Potion from 'your-database/potion'
   * 
   * try {
   *   player.addItem(Potion)
   *   player.sellItem(Potion)
   * } catch (err) {
   *   console.log(err)
   * }
   * ```
   */
  sellItem(itemClass: ItemClass | string, nbToSell?: number): Item;

  /**
   * Use an object. Applies effects and states. Removes the object from the inventory
   * 
   * When an item is used:
   * - Effects are applied to the player (HP/MP restoration, etc.)
   * - States are applied/removed as defined in the item
   * - The item is removed from inventory (consumed)
   * 
   * If the item has a `hitRate` property (0-1), there's a chance the usage might fail.
   * If usage fails, the item is still removed and `onUseFailed()` is called instead of `onUse()`.
   * 
   * The `onUse()` method is called on the ItemClass if the use was successful.
   * The `onUseFailed()` method is called on the ItemClass if the chance roll failed.
   * The `onRemove()` method is called on the ItemClass when the item is removed.
   * 
   * @param itemClass - Item class or string identifier. If string, it's the item ID
   * @returns Item instance that was used
   * @throws {Object} ItemLog.restriction - If the player has the `Effect.CAN_NOT_ITEM` effect
   *   - `id`: `RESTRICTION_ITEM`
   *   - `msg`: Error message
   * @throws {Object} ItemLog.notInInventory - If the item is not in the inventory
   *   - `id`: `ITEM_NOT_INVENTORY`
   *   - `msg`: Error message
   * @throws {Object} ItemLog.notUseItem - If the item's `consumable` property is `false`
   *   - `id`: `NOT_USE_ITEM`
   *   - `msg`: Error message
   * @throws {Object} ItemLog.chanceToUseFailed - If the chance to use the item failed (hitRate roll failed)
   *   - `id`: `USE_CHANCE_ITEM_FAILED`
   *   - `msg`: Error message
   *   - Note: The item is still deleted from the inventory even if usage failed
   * 
   * @example
   * ```ts
   * import Potion from 'your-database/potion'
   * 
   * try {
   *   player.addItem(Potion)
   *   player.useItem(Potion)
   * } catch (err) {
   *   if (err.id === 'USE_CHANCE_ITEM_FAILED') {
   *     console.log('Item usage failed due to chance roll')
   *   } else {
   *     console.log(err)
   *   }
   * }
   * ```
   */
  useItem(itemClass: ItemClass | string): Item;

  /**
   * Equips a weapon or armor on a player
   * 
   * Think first to add the item in the inventory with the `addItem()` method before equipping the item.
   * 
   * The `onEquip()` method is called on the ItemClass when the item is equipped or unequipped.
   * 
   * @param itemClass - Item class or string identifier. If string, it's the item ID
   * @param equip - Equip the item if `true`, unequip if `false` (default: `true`)
   * @throws {Object} ItemLog.notInInventory - If the item is not in the inventory
   *   - `id`: `ITEM_NOT_INVENTORY`
   *   - `msg`: Error message
   * @throws {Object} ItemLog.invalidToEquiped - If the item is not a weapon or armor (item._type is "item")
   *   - `id`: `INVALID_ITEM_TO_EQUIP`
   *   - `msg`: Error message
   * @throws {Object} ItemLog.isAlreadyEquiped - If the item is already equipped
   *   - `id`: `ITEM_ALREADY_EQUIPED`
   *   - `msg`: Error message
   * 
   * @example
   * ```ts
   * import Sword from 'your-database/sword'
   * 
   * try {
   *   player.addItem(Sword)
   *   player.equip(Sword)
   *   // Later, unequip it
   *   player.equip(Sword, false)
   * } catch (err) {
   *   console.log(err)
   * }
   * ```
   */
  equip(itemClass: ItemClass | string, equip?: boolean): void;

  /**
   * Get the player's attack (sum of items equipped)
   * 
   * Returns the total attack value from all equipped items on the player.
   * 
   * @returns Total attack value from equipped items
   * 
   * @example
   * ```ts
   * console.log(player.atk) // 150 (sum of all equipped weapons/armors attack)
   * ```
   */
  readonly atk: number;

  /**
   * Get the player's physical defense (sum of items equipped)
   * 
   * Returns the total physical defense value from all equipped items on the player.
   * 
   * @returns Total physical defense value from equipped items
   * 
   * @example
   * ```ts
   * console.log(player.pdef) // 80 (sum of all equipped armors physical defense)
   * ```
   */
  readonly pdef: number;

  /**
   * Get the player's skill defense (sum of items equipped)
   * 
   * Returns the total skill defense value from all equipped items on the player.
   * 
   * @returns Total skill defense value from equipped items
   * 
   * @example
   * ```ts
   * console.log(player.sdef) // 60 (sum of all equipped armors skill defense)
   * ```
   */
  readonly sdef: number;
}
