import { type Constructor } from "@rpgjs/common";
import { RpgCommonPlayer } from "@rpgjs/common";

/**
 * Interface defining what MoveManager adds to a class
 */
export interface IGoldManager {
  
}

/**
 * Move Manager mixin
 * 
 * Adds methods to manage player gold
 * 
 * @param Base - The base class to extend
 * @returns A new class with gold management capabilities
 */
export function WithGoldManager<TBase extends Constructor<RpgCommonPlayer>>(Base: TBase) {
  return class extends Base implements IGoldManager {
    /** 
     * You can change the game money
     * 
     * ```ts
     * player.gold += 100
     * ```
     * 
     * @title Change Gold
     * @prop {number} player.gold
     * @default 0
     * @memberof GoldManager
     * */
    set gold(val: number) {
        if (val < 0) {
            val = 0
        }
        this._gold.set(val)
    }

    get gold(): number {
        return this._gold()
    }
  };
}
