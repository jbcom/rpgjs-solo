import {
  Constructor,
  isArray,
  isInstanceOf,
  isString,
  PlayerCtor,
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
 * Skill Manager Mixin
 * 
 * Provides skill management capabilities to any class. This mixin handles
 * learning, forgetting, and using skills, including SP cost management,
 * hit rate calculations, and skill effects application.
 * 
 * @param Base - The base class to extend with skill management
 * @returns Extended class with skill management methods
 * 
 * @example
 * ```ts
 * class MyPlayer extends WithSkillManager(BasePlayer) {
 *   constructor() {
 *     super();
 *     // Skill system is automatically initialized
 *   }
 * }
 * 
 * const player = new MyPlayer();
 * player.learnSkill(Fire);
 * player.useSkill(Fire, targetPlayer);
 * ```
 */
export function WithSkillManager<TBase extends PlayerCtor>(Base: TBase) {
  return class extends Base {
    _getSkillIndex(skillClass: any | string) {
      return (this as any).skills().findIndex((skill) => {
        if (isString(skill)) {
          return skill.id == skillClass;
        }
        if (isString(skillClass)) {
          return skillClass == (skill.id || skill);
        }
        return isInstanceOf(skill, skillClass);
      });
    }

    getSkill(skillClass: any | string) {
      const index = this._getSkillIndex(skillClass);
      return this.skills()[index] ?? null;
    }

    learnSkill(skillId: any | string) {
      if (this.getSkill(skillId)) {
        throw SkillLog.alreadyLearned(skillId);
      }
      const instance = (this as any).databaseById(skillId);
      this.skills().push(instance);
      this["execMethod"]("onLearn", [this], instance);
      return instance;
    }

    forgetSkill(skillId: any | string) {
      if (isString(skillId)) skillId = (this as any).databaseById(skillId);
      const index = this._getSkillIndex(skillId);
      if (index == -1) {
        throw SkillLog.notLearned(skillId);
      }
      const instance = this.skills()[index];
      this.skills().splice(index, 1);
      this["execMethod"]("onForget", [this], instance);
      return instance;
    }

    useSkill(skillId: any | string, otherPlayer?: RpgPlayer | RpgPlayer[]) {
      const skill = this.getSkill(skillId);
      if ((this as any).hasEffect(Effect.CAN_NOT_SKILL)) {
        throw SkillLog.restriction(skillId);
      }
      if (!skill) {
        throw SkillLog.notLearned(skillId);
      }
      if (skill.spCost > (this as any).sp) {
        throw SkillLog.notEnoughSp(skillId, skill.spCost, (this as any).sp);
      }
      (this as any).sp -= skill.spCost / ((this as any).hasEffect(Effect.HALF_SP_COST) ? 2 : 1);
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
          (this as any).applyStates(player, skill);
          (player as any).applyDamage(this, skill);
        }
      }
      this["execMethod"]("onUse", [this, otherPlayer], skill);
      return skill;
    }
  } as unknown as TBase;
}

/**
 * Interface for Skill Manager functionality
 * 
 * Provides skill management capabilities including learning, forgetting, and using skills.
 * This interface defines the public API of the SkillManager mixin.
 */
export interface ISkillManager {
  /**
   * Retrieves a learned skill. Returns null if not found
   * 
   * @param skillClass - Skill class or data id
   * @returns Instance of SkillClass or null
   */
  getSkill(skillClass: any | string): any | null;

  /**
   * Learn a skill
   * 
   * @param skillId - Skill class or data id
   * @returns Instance of SkillClass
   * @throws SkillLog.alreadyLearned if the player already knows the skill
   */
  learnSkill(skillId: any | string): any;

  /**
   * Forget a skill
   * 
   * @param skillId - Skill class or data id
   * @returns Instance of SkillClass
   * @throws SkillLog.notLearned if trying to forget a skill not learned
   */
  forgetSkill(skillId: any | string): any;

  /**
   * Using a skill
   * 
   * @param skillId - Skill class or data id
   * @param otherPlayer - Optional target player(s) to apply skill to
   * @returns Instance of SkillClass
   * @throws SkillLog.restriction if player has Effect.CAN_NOT_SKILL
   * @throws SkillLog.notLearned if player tries to use an unlearned skill
   * @throws SkillLog.notEnoughSp if player does not have enough SP
   * @throws SkillLog.chanceToUseFailed if the chance to use the skill has failed
   */
  useSkill(skillId: any | string, otherPlayer?: RpgPlayer | RpgPlayer[]): any;
}
