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

    /** 
     * Assign a variable to the player
     * 
     * Stores a key-value pair in the player's variable map. This is useful for
     * tracking game state, quest progress, flags, and other player-specific data.
     * The variable system provides a flexible way to store any type of data
     * associated with the player that persists throughout the game session.
     * 
     * @param key - The variable identifier (string key to reference the variable)
     * @param val - The value to store (can be any type: boolean, number, string, object, array)
     * @returns void
     * 
     * @example
     * ```ts
     * // Set different types of variables
     * player.setVariable('CHEST_OPENED', true);
     * player.setVariable('playerLevel', 5);
     * player.setVariable('questProgress', { step: 1, completed: false });
     * player.setVariable('inventory', ['sword', 'potion', 'key']);
     * player.setVariable('lastSaveTime', new Date().toISOString());
     * ```
     */
    setVariable(key: string, val: any): void {
      this.variables.set(key, val);
    }

    /** 
     * Get a variable value
     * 
     * Retrieves the value associated with the given key from the player's variables.
     * Returns undefined if the variable doesn't exist. This method is type-safe
     * and can be used with generic types for better TypeScript support.
     * 
     * @param key - The variable identifier to retrieve
     * @returns The stored value or undefined if not found
     * 
     * @example
     * ```ts
     * // Get variables with type inference
     * const hasKey = player.getVariable('CHEST_OPENED'); // boolean | undefined
     * const level = player.getVariable('playerLevel'); // number | undefined
     * const quest = player.getVariable('questProgress'); // object | undefined
     * const missing = player.getVariable('nonexistent'); // undefined
     * 
     * // Use with default values
     * const level = player.getVariable('playerLevel') ?? 1;
     * const isChestOpened = player.getVariable('CHEST_OPENED') ?? false;
     * ```
     */
    getVariable<U = any>(key: string): U | undefined {
      return this.variables.get(key);
    }

    /** 
     * Remove a variable
     * 
     * Deletes a variable from the player's variable map. This is useful for
     * cleaning up temporary flags, resetting certain game states, or managing
     * memory by removing unused variables. The method returns a boolean indicating
     * whether the variable existed and was successfully removed.
     * 
     * @param key - The variable identifier to remove
     * @returns true if a variable existed and has been removed, false if the variable does not exist
     * 
     * @example
     * ```ts
     * // Remove variables and check if they existed
     * const removed = player.removeVariable('CHEST_OPENED'); // true if existed
     * const notFound = player.removeVariable('nonexistent'); // false
     * 
     * // Clean up temporary variables
     * player.removeVariable('tempQuestFlag');
     * player.removeVariable('battleTempData');
     * 
     * // Conditional removal
     * if (player.getVariable('questCompleted')) {
     *   player.removeVariable('questProgress');
     * }
     * ```
     */
    removeVariable(key: string): boolean {
      return this.variables.delete(key);
    }

    /**
     * Check if a variable exists
     * 
     * Determines whether a variable with the given key exists in the player's
     * variable map, regardless of its value (including falsy values like false, 0, '').
     * This is useful when you need to distinguish between a variable that doesn't
     * exist and one that has a falsy value.
     * 
     * @param key - The variable identifier to check
     * @returns true if the variable exists, false otherwise
     * 
     * @example
     * ```ts
     * // Check variable existence
     * player.setVariable('flag', false);
     * player.hasVariable('flag'); // true (even though value is false)
     * player.hasVariable('missing'); // false
     * 
     * // Use in conditional logic
     * if (player.hasVariable('questStarted')) {
     *   // Quest has been started, check progress
     *   const progress = player.getVariable('questProgress');
     * } else {
     *   // Quest not started yet
     *   player.setVariable('questStarted', true);
     * }
     * ```
     */
    hasVariable(key: string): boolean {
      return this.variables.has(key);
    }

    /**
     * Get all variable keys
     * 
     * Returns an array of all variable keys currently stored for this player.
     * This is useful for debugging, serialization, or iterating over all variables.
     * The keys are returned in insertion order.
     * 
     * @returns Array of all variable keys
     * 
     * @example
     * ```ts
     * // Get all variable keys
     * const keys = player.getVariableKeys();
     * console.log('Player has variables:', keys);
     * 
     * // Iterate over all variables
     * keys.forEach(key => {
     *   const value = player.getVariable(key);
     *   console.log(`${key}: ${value}`);
     * });
     * 
     * // Filter specific variable types
     * const questKeys = keys.filter(key => key.startsWith('quest_'));
     * ```
     */
    getVariableKeys(): string[] {
      return Array.from(this.variables.keys());
    }

    /**
     * Clear all variables
     * 
     * Removes all variables from the player's variable map. This is useful for
     * resetting the player state, cleaning up before saving, or starting fresh.
     * Use with caution as this operation cannot be undone.
     * 
     * @returns void
     * 
     * @example
     * ```ts
     * // Clear all variables (use with caution)
     * player.clearVariables();
     * 
     * // Clear variables conditionally
     * if (gameReset) {
     *   player.clearVariables();
     *   // Re-initialize essential variables
     *   player.setVariable('gameStarted', true);
     * }
     * ```
     */
    clearVariables(): void {
      this.variables.clear();
    }
  } as unknown as TBase;
}

/**
 * Type helper to extract the interface from the WithVariableManager mixin
 * This provides the type without duplicating method signatures
 */
export type IVariableManager = InstanceType<ReturnType<typeof WithVariableManager>>;