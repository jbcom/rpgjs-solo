import { type Constructor } from "@rpgjs/common";
import { RpgCommonPlayer } from "@rpgjs/common";

/**
 * Interface defining what MoveManager adds to a class
 */
export interface IWithVariableManager {
  variables: Map<string, any>
}

/**
 * Move Manager mixin
 * 
 * Adds methods to manage player movement
 * 
 * @param Base - The base class to extend
 * @returns A new class with move management capabilities
 */
export function WithVariableManager<TBase extends Constructor<RpgCommonPlayer>>(Base: TBase) {
  return class extends Base implements IWithVariableManager {
    variables: Map<string, any> = new Map()

    /** 
     * Assign a variable to the player
     * 
     * ```ts
     * player.setVariable('OPEN_CHEST', true)
     * ```
     * 
     * @title Set variable
     * @method player.setVariable(key,val)
     * @param {string} key
     * @param {any} val
     * @returns {void}
     * @memberof VariableManager
     * */
    setVariable(key: string, val) {
        this.variables.set(key, val)
    }

    /** 
     * Get a variable
     * 
     * ```ts
     * const val = player.getVariable('OPEN_CHEST')
     * ```
     * 
     * @title Get variable
     * @method player.setVariable(key,val)
     * @param {string} key
     * @returns {any} 
     * @memberof VariableManager
     * */
    getVariable(key: string) {
        return this.variables.get(key)
    }

    /** 
     * Remove a variable
     * 
     * ```ts
     * player.removeVariable('OPEN_CHEST')
     * ```
     * 
     * @title Remove variable
     * @method player.removeVariable(key)
     * @param {string} key
     * @returns {boolean} true if a variable existed and has been removed, or false if the variable does not exist.
     * @memberof VariableManager
     * */
    removeVariable(key: string) {
        return this.variables.delete(key)
    }
  };
}
