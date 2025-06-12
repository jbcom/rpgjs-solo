import {
  arrayFlat,
  arrayUniq,
  Constructor,
  RpgCommonPlayer,
} from "@rpgjs/common";

export interface IWithEffectManager {
  effects: any[];
}

export enum Effect {
  CAN_NOT_SKILL = 'CAN_NOT_SKILL',
  CAN_NOT_ITEM = 'CAN_NOT_ITEM',
  CAN_NOT_STATE = 'CAN_NOT_STATE',
  CAN_NOT_EQUIPMENT = 'CAN_NOT_EQUIPMENT',
  HALF_SP_COST = 'HALF_SP_COST',
  GUARD = 'GUARD',
  SUPER_GUARD = 'SUPER_GUARD'
}

export function WithEffectManager<TBase extends Constructor<RpgCommonPlayer>>(
  Base: TBase
) {
  return class extends Base implements IWithEffectManager {
    /**
     * ```ts
     * import { Effect } from '@rpgjs/database'
     *
     * const bool = player.hasEffect(Effect.CAN_NOT_SKILL)
     * ```
     *
     * @title Has Effect
     * @method player.hasEffect(effect)
     * @param {string} effect
     * @returns {boolean}
     * @memberof EffectManager
     * */
    hasEffect(effect: string): boolean {
      return this.effects.includes(effect);
    }

    /**
     * Retrieves a array of effects assigned to the player, state effects and effects of weapons and armors equipped with the player's own weapons.
     *
     * ```ts
     * console.log(player.effects)
     * ```
     * @title Get Effects
     * @prop {Array<Effect>} player.effects
     * @memberof EffectManager
     * */
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
     * ```ts
     * import { Effect } from '@rpgjs/database'
     *
     * player.effects = [Effect.CAN_NOT_SKILL]
     * ```
     * @title Set Effects
     * @prop {Array<Effect>} player.effects
     * @memberof EffectManager
     * */
    set effects(val) {
      this._effects.set(val);
    }
  };
}
