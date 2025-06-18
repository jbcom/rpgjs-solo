import { Constructor, PlayerCtor, RpgCommonPlayer } from "@rpgjs/common";
import { RpgPlayer } from "./Player";
import { ATK, PDEF, SDEF } from "../presets";
import { Effect } from "./EffectManager";

interface PlayerWithMixins extends RpgCommonPlayer {
  parameters: any[];
  getFormulas(name: string): any;
  hasEffect(effect: string): boolean;
  coefficientElements(attackerPlayer: RpgPlayer): number;
  hp: number;
  getCurrentMap(): any;
}

/**
 * Battle Manager Mixin
 * 
 * Provides battle management capabilities to any class. This mixin handles
 * damage calculation, critical hits, elemental vulnerabilities, and guard effects.
 * It implements a comprehensive battle system with customizable formulas and effects.
 * 
 * @param Base - The base class to extend with battle management
 * @returns Extended class with battle management methods
 * 
 * @example
 * ```ts
 * class MyPlayer extends WithBattleManager(BasePlayer) {
 *   constructor() {
 *     super();
 *     // Battle system is automatically initialized
 *   }
 * }
 * 
 * const player = new MyPlayer();
 * const attacker = new MyPlayer();
 * const result = player.applyDamage(attacker);
 * console.log(`Damage dealt: ${result.damage}`);
 * ```
 */
export function WithBattleManager<TBase extends PlayerCtor>(Base: TBase) {
  return class extends Base {
    /**
     * Apply damage. Player will lose HP. the `attackerPlayer` parameter is the other player, the one who attacks.
     *
     * If you don't set the skill parameter, it will be a physical attack.
     * The attack formula is already defined but you can customize it in the server options.
     * This method handles all aspects of damage calculation including critical hits,
     * elemental vulnerabilities, guard effects, and applies the final damage to HP.
     *
     * @param attackerPlayer - The attacking player who deals the damage
     * @param skill - Optional skill object for magical attacks, if not provided uses physical attack
     * @returns Object containing damage details and special effects that occurred
     * 
     * @example
     * ```ts
     * // Physical attack
     * const result = player.applyDamage(attackerPlayer);
     * console.log(`Physical damage: ${result.damage}, Critical: ${result.critical}`);
     * 
     * // Magical attack with skill
     * const fireSkill = { id: 'fire', power: 50, element: 'fire' };
     * const magicResult = player.applyDamage(attackerPlayer, fireSkill);
     * console.log(`Magic damage: ${magicResult.damage}, Vulnerable: ${magicResult.elementVulnerable}`);
     * 
     * // Check for guard effects
     * if (result.guard) {
     *   console.log('Attack was partially blocked!');
     * }
     * if (result.superGuard) {
     *   console.log('Attack was heavily reduced by super guard!');
     * }
     * ```
     */
    applyDamage(
      attackerPlayer: RpgPlayer,
      skill?: any
    ): {
      damage: number;
      critical: boolean;
      elementVulnerable: boolean;
      guard: boolean;
      superGuard: boolean;
    } {
      const getParam = (player: RpgPlayer) => {
        const params = {};
        (this as any).parameters.forEach((val, key) => {
          params[key] = (player as any).param[key];
        });
        return {
          [ATK]: (player as any).atk,
          [PDEF]: (player as any).pdef,
          [SDEF]: (player as any).sdef,
          ...params,
        };
      };
      let damage = 0,
        fn;
      let critical = false;
      let guard = false;
      let superGuard = false;
      let elementVulnerable = false;
      const paramA = getParam(attackerPlayer);
      const paramB = getParam(<any>this);
      console.log(paramA, paramB)
      if (skill) {
        fn = this.getFormulas("damageSkill");
        if (!fn) {
          throw new Error("Skill Formulas not exists");
        }
        damage = fn(paramA, paramB, skill);
      } else {
        fn = this.getFormulas("damagePhysic");
        if (!fn) {
          throw new Error("Physic Formulas not exists");
        }
        damage = fn(paramA, paramB);
        const coef = (this as any).coefficientElements(attackerPlayer);
        if (coef >= 2) {
          elementVulnerable = true;
        }
        damage *= coef;
        fn = this.getFormulas("damageCritical");
        if (fn) {
          let newDamage = fn(damage, paramA, paramB);
          if (damage != newDamage) {
            critical = true;
          }
          damage = newDamage;
        }
      }
      if ((this as any).hasEffect(Effect.GUARD)) {
        fn = this.getFormulas("damageGuard");
        if (fn) {
          let newDamage = fn(damage, paramA, paramB);
          if (damage != newDamage) {
            guard = true;
          }
          damage = newDamage;
        }
      }
      if ((this as any).hasEffect(Effect.SUPER_GUARD)) {
        damage /= 4;
        superGuard = true;
      }
      (this as any).hp -= damage;
      return {
        damage,
        critical,
        elementVulnerable,
        guard,
        superGuard,
      };
    }

    /**
     * Get damage formulas from the current map
     * 
     * Retrieves the damage calculation formulas defined in the current map's configuration.
     * These formulas are used to calculate different types of damage including physical,
     * magical, critical hits, and guard effects. The formulas provide flexibility in
     * customizing the battle system's damage calculations.
     * 
     * @param name - The name of the formula to retrieve (e.g., 'damagePhysic', 'damageSkill')
     * @returns The formula function or undefined if not found
     * 
     * @example
     * ```ts
     * // Get physical damage formula
     * const physicFormula = player.getFormulas('damagePhysic');
     * if (physicFormula) {
     *   const damage = physicFormula(attackerParams, defenderParams);
     * }
     * 
     * // Get critical damage formula
     * const criticalFormula = player.getFormulas('damageCritical');
     * if (criticalFormula) {
     *   const criticalDamage = criticalFormula(baseDamage, attackerParams, defenderParams);
     * }
     * ```
     */
    getFormulas(name: string) {
      const map = (this as any).getCurrentMap(); 
      return map.damageFormulas[name];
    }
  } as unknown as TBase
}

/**
 * Type helper to extract the interface from the WithBattleManager mixin
 * This provides the type without duplicating method signatures
 */
export type IBattleManager = InstanceType<ReturnType<typeof WithBattleManager>>;
