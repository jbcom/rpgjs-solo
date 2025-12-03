import { Constructor, PlayerCtor } from "@rpgjs/common";

/**
 * Variable Manager Mixin
 * 
 * Provides variable management capabilities to any class. Variables are key-value
 * pairs that can store any type of data associated with the player, such as
 * quest progress, game flags, inventory state, and custom game data.
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
    variables: Map<string, any> = new Map();

    setVariable(key: string, val: any): void {
      this.variables.set(key, val);
    }

    getVariable<U = any>(key: string): U | undefined {
      return this.variables.get(key);
    }

    removeVariable(key: string): boolean {
      return this.variables.delete(key);
    }

    hasVariable(key: string): boolean {
      return this.variables.has(key);
    }

    getVariableKeys(): string[] {
      return Array.from(this.variables.keys());
    }

    clearVariables(): void {
      this.variables.clear();
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
  /** Map storing all player variables */
  variables: Map<string, any>;

  /**
   * Assign a variable to the player
   * 
   * @param key - The variable identifier
   * @param val - The value to store
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