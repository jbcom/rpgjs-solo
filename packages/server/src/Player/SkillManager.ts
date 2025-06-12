import {
  Constructor,
  isArray,
  isInstanceOf,
  isString,
  RpgCommonPlayer,
} from "@rpgjs/common";
import { SkillLog } from "../logs";
import { RpgPlayer } from "./Player";
import { Effect } from "./EffectManager";

/**
 * Interface defining dependencies from other mixins that SkillManager needs
 */
interface SkillManagerDependencies {
  sp: number;
  skills(): any[];
  hasEffect(effect: string): boolean;
  databaseById(id: string): any;
  applyStates(player: RpgPlayer, skill: any): void;
}

/**
 * Interface defining what SkillManager adds to a class
 */
export interface IWithSkillManager {
  getSkill(skillClass: any | string): any;
  learnSkill(skillId: any | string): any;
  forgetSkill(skillId: any | string): any;
  useSkill(skillId: any | string, otherPlayer?: RpgPlayer | RpgPlayer[]): any;
}

export function WithSkillManager<TBase extends Constructor<RpgCommonPlayer & SkillManagerDependencies>>(
  Base: TBase
): Constructor<IWithSkillManager> & TBase {
  return class extends Base implements IWithSkillManager {
    private _getSkillIndex(skillClass: any | string) {
      return this.skills().findIndex((skill) => {
        if (isString(skill)) {
          return skill.id == skillClass;
        }
        if (isString(skillClass)) {
          return skillClass == (skill.id || skill);
        }
        return isInstanceOf(skill, skillClass);
      });
    }

    /**
     * Retrieves a learned skill. Returns null, if not found
     * ```ts
     * import Fire from 'your-database/skills/fire'
     *
     * player.getSkill(Fire)
     *  ```
     *
     * @title Get Skill
     * @method player.getSkill(skillClass)
     * @param {SkillClass | string} skillClass or data id
     * @returns {instance of SkillClass | null}
     * @memberof SkillManager
     */
    getSkill(skillClass: any | string) {
      const index = this._getSkillIndex(skillClass);
      return this.skills()[index] ?? null;
    }

    /**
         * Learn a skill. Attributes the coefficient 1 to the parameter INT (intelligence) if cd is not present on the class.
         * 
         * `onLearn()` method is called on the SkillClass
         * 
         * ```ts
         * import Fire from 'your-database/skills/fire'
         * 
         * player.learnSkill(Fire)
         *  ```
         * 
         * @title Learn Skill
         * @method player.learnSkill(skillClass)
         * @param {SkillClass | string} skillId or data id
         * @throws {SkillLog} alreadyLearned
         *  If the player already knows the skill
         *  ```
            {
                id: SKILL_ALREADY_LEARNED,
                msg: '...'
            }
            ```
         * @returns {instance of SkillClass}
         * @memberof SkillManager
         */
    learnSkill(skillId: any | string) {
      if (this.getSkill(skillId)) {
        throw SkillLog.alreadyLearned(skillId);
      }
      const instance = this.databaseById(skillId);
      this.skills().push(instance);
      this["execMethod"]("onLearn", [this], instance);
      return instance;
    }

    /**
     * Forget a skill
     *
     * `onForget()` method is called on the SkillClass
     *
     * ```ts
     * import Fire from 'your-database/skills/fire'
     *
     * try {
     *      player.forgetSkill(Fire)
     * }
     * catch (err) {
     *      console.log(err)
     * }
     *  ```
     *
     * @title Forget Skill
     * @method player.learnSkill(skillClass)
     * @param {SkillClass | string} skillId or data id
     * @throws {SkillLog} notLearned
     * If trying to forget a skill not learned
     *  ```
     * {
     *      id: SKILL_NOT_LEARNED,
     *      msg: '...'
     * }
     * ```
     * @returns {instance of SkillClass}
     * @memberof SkillManager
     */
    forgetSkill(skillId: any | string) {
      if (isString(skillId)) skillId = this.databaseById(skillId);
      const index = this._getSkillIndex(skillId);
      if (index == -1) {
        throw SkillLog.notLearned(skillId);
      }
      const instance = this.skills()[index];
      this.skills().splice(index, 1);
      this["execMethod"]("onForget", [this], instance);
      return instance;
    }

    /**
     * Using a skill
     *
     * `onUse()` method is called on the SkillClass
     *
     * If other players are indicated then damage will be done to these other players. The method `applyDamage()` will be executed
     *
     * ```ts
     * import Fire from 'your-database/skills/fire'
     *
     * try {
     *      player.useSkill(Fire)
     * }
     * catch (err) {
     *      console.log(err)
     * }
     *  ```
     *
     * or
     *
     *
     * * ```ts
     * import Fire from 'your-database/skills/fire'
     *
     * try {
     *      player.useSkill(Fire, otherPlayer)
     * }
     * catch (err) {
     *      console.log(err)
     * }
     *  ```
     *
     * @title Use Skill
     * @method player.useSkill(skillClass,otherPlayer)
     * @param {SkillClass | string} skillId or data id
     * @param {Array<RpgPlayer> | RpgPlayer} [otherPlayer]
     * @throws {SkillLog} restriction
     * If the player has the `Effect.CAN_NOT_SKILL` effect
     *  ```
     * {
     *      id: RESTRICTION_SKILL,
     *      msg: '...'
     * }
     * ```
     * @throws {SkillLog} notLearned
     * If the player tries to use an unlearned skill
     *  ```
     * {
     *      id: SKILL_NOT_LEARNED,
     *      msg: '...'
     * }
     * ```
     * @throws {SkillLog} notEnoughSp
     * If the player does not have enough SP to use the skill
     *  ```
     * {
     *      id: NOT_ENOUGH_SP,
     *      msg: '...'
     * }
     * ```
     * @throws {SkillLog} chanceToUseFailed
     * If the chance to use the skill has failed (defined with the `hitRate` property)
     *  ```
     * {
     *      id: USE_CHANCE_SKILL_FAILED,
     *      msg: '...'
     * }
     * ```
     *
     * `onUseFailed()` method is called on the SkillClass
     *
     * @returns {instance of SkillClass}
     * @memberof SkillManager
     * @todo
     */
    useSkill(skillId: any | string, otherPlayer?: RpgPlayer | RpgPlayer[]) {
      const skill = this.getSkill(skillId);
      if (this.hasEffect(Effect.CAN_NOT_SKILL)) {
        throw SkillLog.restriction(skillId);
      }
      if (!skill) {
        throw SkillLog.notLearned(skillId);
      }
      if (skill.spCost > this.sp) {
        throw SkillLog.notEnoughSp(skillId, skill.spCost, this.sp);
      }
      this.sp -= skill.spCost / (this.hasEffect(Effect.HALF_SP_COST) ? 2 : 1);
      const hitRate = skill.hitRate ?? 1;
      if (Math.random() > hitRate) {
        this["execMethod"]("onUseFailed", [this, otherPlayer], skill);
        throw SkillLog.chanceToUseFailed(skillId);
      }
      if (otherPlayer) {
        let players: any = otherPlayer;
        if (!isArray(players)) {
          players = [otherPlayer];
        }
        for (let player of players) {
          this.applyStates(player, skill);
          player.applyDamage(this, skill);
        }
      }
      this["execMethod"]("onUse", [this, otherPlayer], skill);
      return skill;
    }
  };
}
