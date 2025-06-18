import {
  arrayFlat,
  arrayUniq,
  Constructor,
  PlayerCtor,
  RpgCommonPlayer,
} from "@rpgjs/common";

export enum Effect {
  CAN_NOT_SKILL = 'CAN_NOT_SKILL',
  CAN_NOT_ITEM = 'CAN_NOT_ITEM',
  CAN_NOT_STATE = 'CAN_NOT_STATE',
  CAN_NOT_EQUIPMENT = 'CAN_NOT_EQUIPMENT',
  HALF_SP_COST = 'HALF_SP_COST',
  GUARD = 'GUARD',
  SUPER_GUARD = 'SUPER_GUARD'
}

/**
 * Effect Manager Mixin
 * 
 * Provides effect management capabilities to any class. This mixin handles
 * player effects including restrictions, buffs, and debuffs. Effects can come
 * from various sources like states, equipment, and temporary conditions.
 * 
 * @param Base - The base class to extend with effect management
 * @returns Extended class with effect management methods
 * 
 * @example
 * ```ts
 * class MyPlayer extends WithEffectManager(BasePlayer) {
 *   constructor() {
 *     super();
 *     // Effect system is automatically initialized
 *   }
 * }
 * 
 * const player = new MyPlayer();
 * player.effects = [Effect.GUARD];
 * console.log(player.hasEffect(Effect.GUARD)); // true
 * ```
 */
export function WithEffectManager<TBase extends PlayerCtor>(Base: TBase) {
  return class extends Base {
    /**
     * Check if the player has a specific effect
     * 
     * Determines whether the player currently has the specified effect active.
     * This includes effects from states, equipment, and temporary conditions.
     * The effect system provides a flexible way to apply various gameplay
     * restrictions and enhancements to the player.
     * 
     * @param effect - The effect identifier to check for
     * @returns true if the player has the effect, false otherwise
     * 
     * @example
     * ```ts
     * import { Effect } from '@rpgjs/database'
     *
     * // Check for skill restriction
     * const cannotUseSkills = player.hasEffect(Effect.CAN_NOT_SKILL);
     * if (cannotUseSkills) {
     *   console.log('Player cannot use skills right now');
     * }
     * 
     * // Check for guard effect
     * const isGuarding = player.hasEffect(Effect.GUARD);
     * if (isGuarding) {
     *   console.log('Player is in guard stance');
     * }
     * 
     * // Check for cost reduction
     * const halfCost = player.hasEffect(Effect.HALF_SP_COST);
     * const actualCost = skillCost / (halfCost ? 2 : 1);
     * ```
     */
    hasEffect(effect: string): boolean {
      return this.effects.includes(effect);
    }

    /**
     * Retrieves a array of effects assigned to the player, state effects and effects of weapons and armors equipped with the player's own weapons.
     *
     * Gets all currently active effects on the player from multiple sources:
     * - Direct effects assigned to the player
     * - Effects from active states (buffs/debuffs)
     * - Effects from equipped weapons and armor
     * The returned array contains unique effects without duplicates.
     * 
     * @returns Array of all active effects on the player
     * 
     * @example
     * ```ts
     * // Get all active effects
     * console.log(player.effects); // ['GUARD', 'HALF_SP_COST', ...]
     * 
     * // Check multiple effects
     * const effects = player.effects;
     * const hasRestrictions = effects.some(effect => 
     *   effect.startsWith('CAN_NOT_')
     * );
     * 
     * // Count beneficial effects
     * const beneficialEffects = effects.filter(effect => 
     *   ['GUARD', 'SUPER_GUARD', 'HALF_SP_COST'].includes(effect)
     * );
     * ```
     */
    get effects(): any[] {
      const getEffects = (prop) => {
        return arrayFlat(this[prop]().map((el) => el.effects || []));
      };
      return arrayUniq([
        ...this._effects(),
        ...getEffects("states"),
        ...getEffects("equipments"),
      ]);
    }

    /**
     * Assigns effects to the player. If you give a array, it does not change the effects of the player's states and armor/weapons equipped.
     *
     * Sets the direct effects on the player. This only affects the player's own effects
     * and does not modify effects from states or equipment. The total effects will be
     * the combination of these direct effects plus any effects from states and equipment.
     * 
     * @param val - Array of effect identifiers to assign to the player
     * 
     * @example
     * ```ts
     * import { Effect } from '@rpgjs/database'
     *
     * // Set direct player effects
     * player.effects = [Effect.CAN_NOT_SKILL];
     * 
     * // Add multiple effects
     * player.effects = [
     *   Effect.GUARD,
     *   Effect.HALF_SP_COST,
     *   Effect.CAN_NOT_ITEM
     * ];
     * 
     * // Clear direct effects (equipment/state effects remain)
     * player.effects = [];
     * 
     * // Temporary effect application
     * const originalEffects = player.effects;
     * player.effects = [...originalEffects, Effect.SUPER_GUARD];
     * // Later restore
     * player.effects = originalEffects;
     * ```
     */
    set effects(val) {
      this._effects.set(val);
    }
  } as unknown as TBase;
}

/**
 * Type helper to extract the interface from the WithEffectManager mixin
 * This provides the type without duplicating method signatures
 */
export type IEffectManager = InstanceType<ReturnType<typeof WithEffectManager>>;
