import { arrayUniq, PlayerCtor, RpgCommonPlayer } from "@rpgjs/common";
import { Constructor } from "@rpgjs/common";
import { RpgPlayer } from "./Player";

/**
 * Element Manager Mixin
 * 
 * Provides elemental management capabilities to any class. This mixin handles
 * elemental resistances, vulnerabilities, and attack elements. It manages both
 * defensive capabilities (elementsDefense) and offensive elements from equipment,
 * as well as player-specific elemental efficiency modifiers.
 * 
 * @param Base - The base class to extend with element management
 * @returns Extended class with element management methods
 * 
 * @example
 * ```ts
 * class MyPlayer extends WithElementManager(BasePlayer) {
 *   constructor() {
 *     super();
 *     this.elementsEfficiency = [{ rate: 0.5, element: 'fire' }];
 *   }
 * }
 * 
 * const player = new MyPlayer();
 * const fireResistance = player.elementsDefense.find(e => e.element === 'fire');
 * ```
 */
export function WithElementManager<TBase extends PlayerCtor>(Base: TBase) {
  return class extends Base {
    _elementsEfficiency: { rate: number; element: any }[] = [];

    /**
     * Recovers the player's elements defense on inventory.  This list is generated from the `elementsDefense` property defined on the weapons or armors equipped.
     * If several items have the same element, only the highest rate will be taken into account.
     *
     * Gets the defensive capabilities against various elements from equipped items.
     * The system automatically consolidates multiple defensive items, keeping only
     * the highest protection rate for each element type. This provides a comprehensive
     * view of the player's elemental resistances from all equipped gear.
     * 
     * @returns Array of element defense objects with rate and element properties
     * 
     * @example
     * ```ts
     * import { Armor } from '@rpgjs/server'
     *
     * enum Elements {
     *   Fire = 'fire'
     * }
     *
     * @Armor({
     *      name: 'Shield',
     *      elementsDefense: [{ rate: 1, element: Elements.Fire }]
     * })
     * class Shield {}
     *
     * @Armor({
     *      name: 'FireShield',
     *      elementsDefense: [{ rate: 0.5, element: Elements.Fire }]
     * })
     * class FireShield {}
     *
     * player.addItem(Shield)
     * player.addItem(FireShield)
     * player.equip(Shield)
     * player.equip(FireShield)
     *
     * console.log(player.elementsDefense) // [{ rate: 1, element: 'fire' }]
     * 
     * // Check specific element defense
     * const fireDefense = player.elementsDefense.find(def => def.element === 'fire');
     * if (fireDefense) {
     *   console.log(`Fire defense rate: ${fireDefense.rate}`);
     * }
     * ```
     */
    get elementsDefense(): { rate: number; element: any }[] {
      return (this as any).getFeature("elementsDefense", "element");
    }

    /**
     * Set or retrieves all the elements where the player is vulnerable or not.
     *
     * Manages the player's elemental efficiency modifiers, which determine how
     * effective different elements are against this player. Values greater than 1
     * indicate vulnerability, while values less than 1 indicate resistance.
     * This combines both class-based efficiency and player-specific modifiers.
     * 
     * @returns Array of element efficiency objects with rate and element properties
     * 
     * @example
     * ```ts
     * import { Class } from '@rpgjs/server'
     *
     * enum Elements {
     *   Fire = 'fire',
     *   Ice = 'ice'
     * }
     *
     * @Class({
     *      name: 'Fighter',
     *      elementsEfficiency: [{ rate: 1, element: Elements.Fire }]
     * })
     * class Hero {}
     *
     * player.setClass(Hero)
     *
     * console.log(player.elementsEfficiency) // [{ rate: 1, element: 'fire' }]
     *
     * player.elementsEfficiency = [{ rate: 2, element: Elements.Ice }]
     *
     * console.log(player.elementsEfficiency) // [{ rate: 1, element: 'fire' }, { rate: 2, element: 'ice' }]
     * 
     * // Check for vulnerabilities
     * const vulnerabilities = player.elementsEfficiency.filter(eff => eff.rate > 1);
     * console.log('Vulnerable to:', vulnerabilities.map(v => v.element));
     * 
     * // Check for resistances
     * const resistances = player.elementsEfficiency.filter(eff => eff.rate < 1);
     * console.log('Resistant to:', resistances.map(r => r.element));
     * ```
     */
    get elementsEfficiency(): { rate: number; element: any }[] {
      if (this._class()) {
        return <any>[
          ...this._elementsEfficiency,
          ...(this._class()?.elementsEfficiency || []),
        ];
      }
      return this._elementsEfficiency;
    }

    set elementsEfficiency(val) {
      this._elementsEfficiency = val;
    }

    /**
     * Retrieves a array of elements assigned to the player and the elements of the weapons / armor equipped
     *
     * Gets all offensive elements available to the player from equipped weapons and armor.
     * This determines what elemental damage types the player can deal in combat.
     * The system automatically combines elements from all equipped items and removes duplicates.
     * 
     * @returns Array of element objects with rate and element properties for offensive capabilities
     * 
     * @example
     * ```ts
     * // Get all offensive elements
     * console.log(player.elements); // [{ rate: 1.5, element: 'fire' }, { rate: 1.2, element: 'ice' }]
     * 
     * // Check if player can deal fire damage
     * const hasFireElement = player.elements.some(el => el.element === 'fire');
     * if (hasFireElement) {
     *   console.log('Player can deal fire damage');
     * }
     * 
     * // Get strongest element
     * const strongestElement = player.elements.reduce((max, current) => 
     *   current.rate > max.rate ? current : max
     * );
     * console.log(`Strongest element: ${strongestElement.element} (${strongestElement.rate})`);
     * ```
     */
    get elements(): {
      rate: number;
      element: string;
    }[] {
      let elements: any = [];
      for (let item of this.equipments()) {
        if (item.elements) {
          elements = [...elements, ...item.elements];
        }
      }
      return arrayUniq(elements);
    }

    /**
     * Calculate elemental damage coefficient against another player
     * 
     * Determines the damage multiplier when this player attacks another player,
     * taking into account the attacker's offensive elements, the defender's
     * elemental efficiency, and elemental defense from equipment. This is used
     * in the battle system to calculate elemental damage modifiers.
     * 
     * @param otherPlayer - The target player to calculate coefficient against
     * @returns Numerical coefficient to multiply base damage by
     * 
     * @example
     * ```ts
     * // Calculate elemental damage coefficient
     * const firePlayer = new MyPlayer();
     * const icePlayer = new MyPlayer();
     * 
     * // Fire player attacks ice player (assuming ice is weak to fire)
     * const coefficient = icePlayer.coefficientElements(firePlayer);
     * console.log(`Damage multiplier: ${coefficient}`); // e.g., 2.0 for double damage
     * 
     * // Use in damage calculation
     * const baseDamage = 100;
     * const finalDamage = baseDamage * coefficient;
     * console.log(`Final damage: ${finalDamage}`);
     * 
     * // Check for elemental advantage
     * if (coefficient > 1) {
     *   console.log('Attacker has elemental advantage!');
     * } else if (coefficient < 1) {
     *   console.log('Defender resists this element');
     * }
     * ```
     */
    coefficientElements(otherPlayer: RpgPlayer): number {
      const atkPlayerElements: any = (otherPlayer as any).elements;
      const playerElements: any = this.elementsEfficiency;
      let coefficient = 1;

      for (let atkElement of atkPlayerElements) {
        const elementPlayer = playerElements.find(
          (el) => el.element == atkElement.element
        );
        const elementPlayerDef = this.elementsDefense.find(
          (el) => el.element == atkElement.element
        );
        if (!elementPlayer) continue;
        const fn = (this as any).getFormulas("coefficientElements");
        if (!fn) {
          return coefficient;
        }
        coefficient += fn(
          atkElement,
          elementPlayer,
          elementPlayerDef || { rate: 0 }
        );
      }
      return coefficient;
    }
  } as unknown as TBase;
}

/**
 * Type helper to extract the interface from the WithElementManager mixin
 * This provides the type without duplicating method signatures
 */
export type IElementManager = InstanceType<ReturnType<typeof WithElementManager>>;
