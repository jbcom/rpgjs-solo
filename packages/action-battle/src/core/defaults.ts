import type { RpgPlayer } from "@rpgjs/server";
import type {
  ActionBattleAiBehavior,
  ActionBattleAttackContext,
  ActionBattleCombatSystem,
  ActionBattleDamageContext,
  ActionBattleKnockbackContext,
  ActionBattleKnockbackResult,
  ActionBattleSystems,
} from "./contracts";

const DEFAULT_CORE_KNOCKBACK = {
  force: 50,
  duration: 300,
};

const CoreAttackPattern = {
  Melee: "melee",
  Combo: "combo",
  Charged: "charged",
  Zone: "zone",
  DashAttack: "dashAttack",
} as const;

const CoreEnemyType = {
  Aggressive: "aggressive",
  Defensive: "defensive",
  Ranged: "ranged",
  Tank: "tank",
  Berserker: "berserker",
} as const;

export const DEFAULT_ZELDA_PLAYER_HITBOXES = {
  up: { offsetX: -16, offsetY: -48, width: 32, height: 32 },
  down: { offsetX: -16, offsetY: 16, width: 32, height: 32 },
  left: { offsetX: -48, offsetY: -16, width: 32, height: 32 },
  right: { offsetX: 16, offsetY: -16, width: 32, height: 32 },
  default: { offsetX: 0, offsetY: -32, width: 32, height: 32 },
};

const resolveEquippedWeapon = (entity: any) => {
  const equipments = entity?.equipments?.() || [];
  for (const item of equipments) {
    const itemId = item?.id?.() ?? item?.id;
    const itemData = entity?.databaseById?.(itemId);
    if (itemData?._type === "weapon") return itemData;
  }
  return null;
};

const resolveDirection = (attacker: any, target: any) => {
  const dx = target.x() - attacker.x();
  const dy = target.y() - attacker.y();
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance <= 0) return undefined;
  return {
    x: dx / distance,
    y: dy / distance,
  };
};

export const createDefaultPlayerHitboxResolver =
  (hitboxes = DEFAULT_ZELDA_PLAYER_HITBOXES) =>
  (context: ActionBattleAttackContext) => {
    const attacker = context.attacker as any;
    const direction =
      context.direction ??
      (typeof attacker.getDirection === "function"
        ? attacker.getDirection()
        : "default");
    const config =
      hitboxes[direction as keyof typeof hitboxes] || hitboxes.default;
    return [
      {
        x: attacker.x() + config.offsetX,
        y: attacker.y() + config.offsetY,
        width: config.width,
        height: config.height,
      },
    ];
  };

export const defaultRpgjsDamageResolver = (
  context: ActionBattleDamageContext
) => {
  const target = context.target as any;
  const raw = target.applyDamage(context.attacker as any, context.skill);
  return {
    damage: raw?.damage ?? 0,
    defeated: target.hp <= 0,
    raw,
  };
};

export const defaultKnockbackResolver = (
  context: ActionBattleKnockbackContext
): ActionBattleKnockbackResult => {
  const weapon = context.weapon ?? resolveEquippedWeapon(context.attacker);
  return {
    force: weapon?.knockbackForce ?? DEFAULT_CORE_KNOCKBACK.force,
    duration: weapon?.knockbackDuration ?? DEFAULT_CORE_KNOCKBACK.duration,
    direction: resolveDirection(context.attacker as any, context.target as any),
  };
};

export const defaultCombatSystem: ActionBattleCombatSystem = {
  resolveHitboxes: createDefaultPlayerHitboxResolver(),
  resolveDamage: defaultRpgjsDamageResolver,
  resolveKnockback: defaultKnockbackResolver,
};

export const defaultEnemyBehaviors: Record<string, ActionBattleAiBehavior> = {
  [CoreEnemyType.Aggressive]: ({ hpPercent }) => ({
    mode: hpPercent !== null && hpPercent < 0.15 ? "retreat" : "assault",
    attackPatterns: [
      CoreAttackPattern.Melee as any,
      CoreAttackPattern.Combo as any,
      CoreAttackPattern.DashAttack as any,
    ],
  }),
  [CoreEnemyType.Defensive]: ({ hpPercent }) => ({
    mode: hpPercent !== null && hpPercent < 0.3 ? "retreat" : "tactical",
    attackPatterns: [CoreAttackPattern.Melee as any, CoreAttackPattern.Charged as any],
  }),
  [CoreEnemyType.Ranged]: ({ distance }) => ({
    mode: distance !== null && distance < 80 ? "retreat" : "tactical",
    attackPatterns: [CoreAttackPattern.Melee as any, CoreAttackPattern.Zone as any],
  }),
  [CoreEnemyType.Tank]: () => ({
    mode: "assault",
    attackPatterns: [
      CoreAttackPattern.Melee as any,
      CoreAttackPattern.Charged as any,
      CoreAttackPattern.Zone as any,
    ],
  }),
  [CoreEnemyType.Berserker]: ({ hpPercent }) => ({
    mode: "assault",
    attackCooldown:
      hpPercent === null ? undefined : Math.max(250, 800 * Math.max(0.3, hpPercent)),
    attackPatterns: [
      CoreAttackPattern.Melee as any,
      CoreAttackPattern.Combo as any,
      CoreAttackPattern.DashAttack as any,
    ],
  }),
};

export const defaultActionBattleSystems: ActionBattleSystems = {
  combat: defaultCombatSystem,
  ai: {
    behaviors: defaultEnemyBehaviors,
  },
};

export const getEntityWeaponKnockbackForce = (entity: RpgPlayer): number => {
  return defaultKnockbackResolver({
    attacker: entity,
    target: entity,
    damage: { damage: 0, defeated: false },
  }).force;
};
