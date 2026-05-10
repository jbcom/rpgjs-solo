import { Constructor, PlayerCtor } from "@rpgjs/common";
import { signal, type WritableSignal } from "@signe/reactive";
import { type } from "@signe/sync";

/**
 * Variable Manager Mixin
 * 
 * Provides variable management capabilities to any class. Variables are key-value
 * pairs that can store any type of data associated with the player, such as
 * quest progress, game flags, inventory state, and custom game data.
 *
 * Player variables have two main roles:
 *
 * 1. Persist player-specific state so it can be restored from saves.
 * 2. Carry that state across maps and map servers through the player snapshot.
 * 
 * @param Base - The base class to extend with variable management
 * @returns Extended class with variable management methods
 * 
 * @example
 * ```ts
 * class MyPlayer extends WithVariableManager(BasePlayer) {
 *   constructor() {
 *     super();
 *     // Variables are automatically initialized
 *   }
 * }
 * 
 * const player = new MyPlayer();
 * player.setVariable('questCompleted', true);
 * ```
 */
export function WithVariableManager<TBase extends PlayerCtor>(Base: TBase) {
  return class extends Base {
    variables: WritableSignal<Record<string, any>> = type(
      signal<Record<string, any>>({}) as never,
      'variables',
      { persist: true },
      this as never
    ) as unknown as WritableSignal<Record<string, any>>;

    setVariable(key: string, val: any): void {
      this.variables.mutate((variables) => {
        variables[key] = val;
      });
    }

    getVariable<U = any>(key: string): U | undefined {
      return this.variables()[key];
    }

    removeVariable(key: string): boolean {
      const variables = this.variables();
      if (!(key in variables)) {
        return false;
      }
      this.variables.mutate((draft) => {
        delete draft[key];
      });
      return true;
    }

    hasVariable(key: string): boolean {
      return key in this.variables();
    }

    getVariableKeys(): string[] {
      return Object.keys(this.variables());
    }

    clearVariables(): void {
      this.variables.set({});
    }
  } as unknown as TBase;
}

/**
 * Interface for Variable Manager functionality
 * 
 * Provides variable management capabilities including storing, retrieving, and managing
 * key-value pairs for player-specific data. This interface defines the public API
 * of the VariableManager mixin.
 */
export interface IVariableManager {
  /**
   * Map storing all player variables.
   *
   * These values belong to the player, are persisted, and travel with the
   * player snapshot when switching maps or servers.
   */
  variables: Map<string, any>;

  /**
   * Assign a variable to the player.
   *
   * Use player variables for quest flags, per-player event state, and any value
   * that must survive saves and map transitions.
   * 
   * @param key - The variable identifier
   * @param val - The value to store
   * @memberof VariableManager
   */
  setVariable(key: string, val: any): void;

  /**
   * Get a variable value
   * 
   * @param key - The variable identifier to retrieve
   * @returns The stored value or undefined if not found
   */
  getVariable<U = any>(key: string): U | undefined;

  /**
   * Remove a variable
   * 
   * @param key - The variable identifier to remove
   * @returns true if a variable existed and has been removed, false otherwise
   */
  removeVariable(key: string): boolean;

  /**
   * Check if a variable exists
   * 
   * @param key - The variable identifier to check
   * @returns true if the variable exists, false otherwise
   */
  hasVariable(key: string): boolean;

  /**
   * Get all variable keys
   * 
   * @returns Array of all variable keys
   */
  getVariableKeys(): string[];

  /**
   * Clear all variables
   */
  clearVariables(): void;
}
