import type { ActionBattleCombatSystem, ActionBattleHitContext, ActionBattleHitResult } from "./contracts";

export const applyActionBattleHit = (
  system: ActionBattleCombatSystem,
  context: ActionBattleHitContext
): ActionBattleHitResult => {
  let hitContext = { ...context };
  const before = system.hooks?.beforeHit?.(hitContext);
  if (before === false) {
    return {
      damage: 0,
      knockbackForce: 0,
      knockbackDuration: 0,
      defeated: false,
      attacker: hitContext.attacker,
      target: hitContext.target,
      cancelled: true,
      metadata: hitContext.metadata,
    };
  }
  if (before) hitContext = before;

  const damage =
    hitContext.damage ??
    system.resolveDamage({
      attacker: hitContext.attacker,
      target: hitContext.target,
      skill: hitContext.skill,
      pattern: hitContext.pattern,
    });
  hitContext.damage = damage;

  const afterDamage = system.hooks?.afterDamage?.(hitContext);
  if (afterDamage) hitContext = afterDamage;

  const knockback =
    hitContext.knockback ??
    system.resolveKnockback({
      attacker: hitContext.attacker,
      target: hitContext.target,
      damage,
    });
  hitContext.knockback = knockback;

  if (!damage.defeated && knockback.force > 0 && knockback.direction) {
    (hitContext.target as any).knockback?.(
      knockback.direction,
      knockback.force,
      knockback.duration
    );
  }

  const result: ActionBattleHitResult = {
    damage: damage.damage,
    knockbackForce: knockback.force,
    knockbackDuration: knockback.duration,
    defeated: damage.defeated,
    attacker: hitContext.attacker,
    target: hitContext.target,
    rawDamage: damage.raw,
    metadata: hitContext.metadata,
  };

  system.hooks?.afterHit?.(result);
  return result;
};
