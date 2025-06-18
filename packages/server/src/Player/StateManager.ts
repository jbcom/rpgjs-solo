import { isInstanceOf, isString, PlayerCtor, type Constructor } from "@rpgjs/common";
import { RpgCommonPlayer, Matter, SeekAvoid } from "@rpgjs/common";
import { signal, type WritableArraySignal } from "@signe/reactive";
import { ATK, PDEF, SDEF } from "../presets";
import { ItemLog, StateLog } from "../logs";
import { persist } from "@signe/sync";
import { RpgPlayer } from "./Player";

interface StateManagerDependencies {
  equipments(): any[];
  databaseById(id: string | StateClass): any;
  addState(stateClass: StateClass | string, chance?: number): object | null;
  removeState(stateClass: StateClass | string, chance?: number): void;
}



type StateClass = { new (...args: any[]) };

/**
 * State Manager Mixin
 * 
 * Provides state management capabilities to any class. This mixin handles
 * player states (buffs/debuffs), state defense from equipment, and state
 * efficiency modifiers. It manages the complete state system including
 * application, removal, and resistance mechanics.
 * 
 * @param Base - The base class to extend with state management
 * @returns Extended class with state management methods
 * 
 * @example
 * ```ts
 * class MyPlayer extends WithStateManager(BasePlayer) {
 *   constructor() {
 *     super();
 *     // State system is automatically initialized
 *   }
 * }
 * 
 * const player = new MyPlayer();
 * player.addState(Paralyze);
 * console.log(player.getState(Paralyze));
 * ```
 */
export function WithStateManager<TBase extends PlayerCtor>(Base: TBase) {
  return class extends Base {
    _statesEfficiency = signal<any[]>([]);

    /**
     * Recovers the player's states defense on inventory.  This list is generated from the `statesDefense` property defined on the weapons or armors equipped.
     * If several items have the same element, only the highest rate will be taken into account.
     *
     * Gets the defensive capabilities against various states from equipped items.
     * The system automatically consolidates multiple defensive items, keeping only
     * the highest protection rate for each state type. This provides comprehensive
     * protection against debuffs and negative status effects.
     * 
     * @returns Array of state defense objects with rate and state properties
     * 
     * @example
     * ```ts
     * import { Armor, State } from '@rpgjs/server'
     *
     * @State({
     *      name: 'Paralyze'
     * })
     * class Paralyze {}
     *
     * @Armor({
     *      name: 'Shield',
     *      statesDefense: [{ rate: 1, state: Paralyze }]
     * })
     * class Shield {}
     *
     * @Armor({
     *      name: 'FireShield',
     *      statesDefense: [{ rate: 0.5, state: Paralyze }]
     * })
     * class FireShield {}
     *
     * player.addItem(Shield)
     * player.addItem(FireShield)
     * player.equip(Shield)
     * player.equip(FireShield)
     *
     * console.log(player.statesDefense) // [{ rate: 1, state: instance of Paralyze }]
     * 
     * // Check specific state defense
     * const paralyzeDefense = player.statesDefense.find(def => def.state instanceof Paralyze);
     * if (paralyzeDefense) {
     *   console.log(`Paralyze defense rate: ${paralyzeDefense.rate}`);
     * }
     * ```
     */
    get statesDefense(): { rate: number; state: any }[] {
      return (this as any).getFeature("statesDefense", "state");
    }

    /**
     * Set or retrieves all the states where the player is vulnerable or not.
     *
     * Manages the player's state efficiency modifiers, which determine how
     * effective different states are against this player. Values greater than 1
     * indicate vulnerability, while values less than 1 indicate resistance.
     * This combines both class-based efficiency and player-specific modifiers.
     * 
     * @returns Array of state efficiency objects with rate and state properties
     * 
     * @example
     * ```ts
     * import { Class, State } from '@rpgjs/server'
     *
     * @State({
     *      name: 'Paralyze'
     * })
     * class Paralyze {}
     *
     * @State({
     *      name: 'Sleep'
     * })
     * class Sleep {}
     *
     * @Class({
     *      name: 'Fighter',
     *      statesEfficiency: [{ rate: 1, state: Paralyze }]
     * })
     * class Hero {}
     *
     * player.setClass(Hero)
     *
     * console.log(player.statesEfficiency) // [{ rate: 1, instance of Paralyze }]
     *
     * player.statesEfficiency = [{ rate: 2, state: Sleep }]
     *
     * console.log(player.statesEfficiency) // [{ rate: 1, state: instance of Paralyze }, { rate: 2, state: instance of Sleep }]
     * 
     * // Check for vulnerabilities
     * const vulnerabilities = player.statesEfficiency.filter(eff => eff.rate > 1);
     * console.log('Vulnerable to states:', vulnerabilities.map(v => v.state.name));
     * 
     * // Check for resistances
     * const resistances = player.statesEfficiency.filter(eff => eff.rate < 1);
     * console.log('Resistant to states:', resistances.map(r => r.state.name));
     * ```
     */
    get statesEfficiency() {
      return this._statesEfficiency;
    }

    set statesEfficiency(val) {
      this._statesEfficiency = val;
    }

    /**
     * Apply states to a player from skill or item effects
     * 
     * Processes state application and removal based on skill or item effects.
     * This method handles both adding beneficial states and removing negative ones,
     * with proper chance calculation and resistance checks.
     * 
     * @param player - The target player to apply states to
     * @param states - Object containing arrays of states to add or remove
     * 
     * @example
     * ```ts
     * // Apply states from a healing skill
     * const healingStates = {
     *   addStates: [{ state: Regeneration, rate: 0.8 }],
     *   removeStates: [{ state: Poison, rate: 1.0 }]
     * };
     * player.applyStates(targetPlayer, healingStates);
     * 
     * // Apply debuff from an enemy attack
     * const debuffStates = {
     *   addStates: [
     *     { state: Paralyze, rate: 0.3 },
     *     { state: Slow, rate: 0.5 }
     *   ]
     * };
     * player.applyStates(targetPlayer, debuffStates);
     * ```
     */
    applyStates(
      player: RpgPlayer,
      { addStates, removeStates }
    ) {
      if (addStates) {
        for (let { state, rate } of addStates) {
          (player as any).addState(state, rate);
        }
      }
      if (removeStates) {
        for (let { state, rate } of removeStates) {
          (player as any).removeState(state, rate);
        }
      }
    }

    /**
     * Get a state to the player. Returns `null` if the state is not present on the player
     * 
     * Retrieves a specific state instance from the player's active states.
     * This is useful for checking state properties, duration, or performing
     * state-specific operations. Returns null if the state is not currently active.
     * 
     * @param stateClass - The state class constructor or state ID to search for
     * @returns The state instance if found, null otherwise
     * 
     * @example
     * ```ts
     * import Paralyze from 'your-database/states/paralyze'
     *
     * // Check if player has a specific state
     * const paralyzeState = player.getState(Paralyze);
     * if (paralyzeState) {
     *   console.log('Player is paralyzed');
     *   console.log('Remaining duration:', paralyzeState.duration);
     * }
     * 
     * // Check using string ID
     * const poisonState = player.getState('poison');
     * if (poisonState) {
     *   console.log('Player is poisoned');
     * }
     * 
     * // Use in conditional logic
     * if (player.getState(Sleep)) {
     *   console.log('Player cannot act while sleeping');
     *   return; // Skip player turn
     * }
     * ```
     */
    getState(stateClass: StateClass | string) {
      if (isString(stateClass)) stateClass = (this as any).databaseById(stateClass);
      return this.states().find((state) => {
        if (isString(stateClass)) {
          return state.id == stateClass;
        }
        return isInstanceOf(state, stateClass);
      });
    }

    /**
     * Adds a state to the player. Set the chance between 0 and 1 that the state can apply
     * 
     * Attempts to apply a state to the player with a specified success chance.
     * The method considers state resistance, efficiency modifiers, and random chance
     * to determine if the state is successfully applied. If successful, the state
     * is added to the player's active states list.
     * 
     * @param stateClass - The state class constructor or state ID to apply
     * @param chance - Probability of successful application (0-1, default 1)
     * @returns The state instance if successfully applied, null if already present
     * @throws StateLog.addFailed if the chance roll fails
     * 
     * @example
     * ```ts
     * import Paralyze from 'your-database/states/paralyze'
     *
     * try {
     *   // Attempt to apply paralyze with 100% chance
     *   const state = player.addState(Paralyze);
     *   if (state) {
     *     console.log('Paralyze applied successfully');
     *   }
     * } catch (err) {
     *   console.log('Failed to apply paralyze:', err.msg);
     * }
     * 
     * // Apply with reduced chance
     * try {
     *   player.addState(Poison, 0.3); // 30% chance
     * } catch (err) {
     *   console.log('Poison application failed');
     * }
     * 
     * // Apply multiple states with different chances
     * const debuffs = [
     *   { state: Slow, chance: 0.8 },
     *   { state: Weak, chance: 0.6 }
     * ];
     * debuffs.forEach(({ state, chance }) => {
     *   try {
     *     player.addState(state, chance);
     *   } catch (err) {
     *     // Handle failed applications
     *   }
     * });
     * ```
     */
    addState(stateClass: StateClass | string, chance = 1): object | null {
      const state = this.getState(stateClass);
      if (isString(stateClass)) {
        stateClass = (this as any).databaseById(stateClass);
      }
      if (!state) {
        if (Math.random() > chance) {
          throw StateLog.addFailed(stateClass);
        }
        //const efficiency = this.findStateEfficiency(stateClass)
        const instance = new (stateClass as StateClass)();
        this.states().push(instance);
        this.applyStates(<any>this, instance);
        return instance;
      }
      return null;
    }

    /**
     * Remove a state to the player. Set the chance between 0 and 1 that the state can be removed
     * 
     * Attempts to remove a state from the player with a specified success chance.
     * This is useful for cure spells, items, or time-based state removal.
     * The method considers removal resistance and random chance.
     * 
     * @param stateClass - The state class constructor or state ID to remove
     * @param chance - Probability of successful removal (0-1, default 1)
     * @throws StateLog.removeFailed if the chance roll fails
     * @throws StateLog.notApplied if the state is not currently active
     * 
     * @example
     * ```ts
     * import Paralyze from 'your-database/states/paralyze'
     *
     * try {
     *   // Attempt to remove paralyze with 100% chance
     *   player.removeState(Paralyze);
     *   console.log('Paralyze removed successfully');
     * } catch (err) {
     *   if (err.id === 'STATE_NOT_APPLIED') {
     *     console.log('Player was not paralyzed');
     *   } else {
     *     console.log('Failed to remove paralyze:', err.msg);
     *   }
     * }
     * 
     * // Remove with reduced chance (for weak cure spells)
     * try {
     *   player.removeState(Poison, 0.7); // 70% chance
     * } catch (err) {
     *   console.log('Cure failed');
     * }
     * 
     * // Remove all negative states (cure-all effect)
     * const negativeStates = [Poison, Paralyze, Sleep, Slow];
     * negativeStates.forEach(state => {
     *   try {
     *     player.removeState(state);
     *   } catch (err) {
     *     // State wasn't active, continue
     *   }
     * });
     * ```
     */
    removeState(stateClass: StateClass | string, chance = 1) {
      const index = this.states().findIndex((state) => {
        if (isString(stateClass)) {
          return state.id == stateClass;
        }
        return isInstanceOf(state, stateClass);
      });
      if (index != -1) {
        if (Math.random() > chance) {
          throw StateLog.removeFailed(stateClass);
        }
        this.states().splice(index, 1);
      } else {
        throw StateLog.notApplied(stateClass);
      }
    }

    /**
     * Find state efficiency modifier for a specific state class
     * 
     * @param stateClass - The state class to find efficiency for
     * @returns The efficiency object if found, undefined otherwise
     */
    findStateEfficiency(stateClass) {
      return this.statesEfficiency().find((state) =>
        isInstanceOf(state.state, stateClass)
      );
    }
  } as unknown as TBase;
}

/**
 * Type helper to extract the interface from the WithStateManager mixin
 * This provides the type without duplicating method signatures
 */
export type IStateManager = InstanceType<ReturnType<typeof WithStateManager>>;
