import { RpgEvent, RpgPlayer } from "@rpgjs/server";
import type {
  ActionBattleEntity,
  ActionBattleTargetContext,
  ActionBattleTargetOptions,
  ActionBattleTargetSelector,
} from "./contracts";

export const ACTION_BATTLE_PLAYER_FACTION = "players";
export const ACTION_BATTLE_ENEMY_FACTION = "enemies";

type EntityKind = "player" | "event";

const getBattleAi = (entity: ActionBattleEntity) => (entity as any)?.battleAi;

export const getActionBattleEntityKind = (
  entity: ActionBattleEntity
): EntityKind => {
  if ((entity as any) instanceof RpgPlayer) return "player";
  if ((entity as any) instanceof RpgEvent) return "event";
  if (getBattleAi(entity)) return "event";
  if (typeof (entity as any)?.attachShape === "function") return "event";
  return "player";
};

export const isActionBattlePlayer = (entity: ActionBattleEntity): boolean =>
  getActionBattleEntityKind(entity) === "player";

export const isActionBattleEvent = (entity: ActionBattleEntity): boolean =>
  getActionBattleEntityKind(entity) === "event";

export const isActionBattleCombatEntity = (
  entity: ActionBattleEntity | undefined | null
): entity is ActionBattleEntity => {
  if (!entity) return false;
  if (isActionBattlePlayer(entity as ActionBattleEntity)) return true;
  return !!getBattleAi(entity as ActionBattleEntity);
};

export const getActionBattleFaction = (
  entity: ActionBattleEntity,
  options: ActionBattleTargetOptions = {}
): string | undefined => {
  const configured = options.getFaction?.(entity);
  if (configured !== undefined) return configured;

  const battleAi = getBattleAi(entity);
  if (battleAi && typeof battleAi.getFaction === "function") {
    const faction = battleAi.getFaction();
    if (faction !== undefined) return faction;
  }

  const entityFaction =
    (entity as any).actionBattleFaction ?? (entity as any).faction;
  if (entityFaction !== undefined) return String(entityFaction);

  if (isActionBattlePlayer(entity)) return ACTION_BATTLE_PLAYER_FACTION;
  if (battleAi) return ACTION_BATTLE_ENEMY_FACTION;
  return undefined;
};

export const getActionBattleTargets = (
  entity: ActionBattleEntity,
  fallback: ActionBattleTargetSelector
): ActionBattleTargetSelector => {
  const battleAi = getBattleAi(entity);
  if (battleAi && typeof battleAi.getTargets === "function") {
    return battleAi.getTargets();
  }
  return (entity as any).actionBattleTargets ?? fallback;
};

export const isActionBattleTargetDefeated = (
  target: ActionBattleEntity | null | undefined
): boolean => {
  if (!target) return true;
  const hp = (target as any).hp;
  return typeof hp === "number" && hp <= 0;
};

export const matchesActionBattleTargetSelector = (
  selector: ActionBattleTargetSelector | undefined,
  context: ActionBattleTargetContext
): boolean => {
  if (!selector) return false;
  if (typeof selector === "function") return selector(context);
  if (selector === "all") return true;
  if (selector === "players") return isActionBattlePlayer(context.target);
  if (selector === "events") return isActionBattleEvent(context.target);
  if (selector === "hostile") {
    return (
      !!context.attackerFaction &&
      !!context.targetFaction &&
      context.attackerFaction !== context.targetFaction
    );
  }
  if (Array.isArray(selector)) {
    return !!context.targetFaction && selector.includes(context.targetFaction);
  }
  return false;
};

export const canActionBattleTarget = (
  attacker: ActionBattleEntity,
  target: ActionBattleEntity,
  selector: ActionBattleTargetSelector | undefined,
  options: ActionBattleTargetOptions = {}
): boolean => {
  if (attacker === target) return false;
  if (!isActionBattleCombatEntity(target)) return false;
  if (isActionBattleTargetDefeated(target)) return false;

  const context: ActionBattleTargetContext = {
    attacker,
    target,
    attackerFaction: getActionBattleFaction(attacker, options),
    targetFaction: getActionBattleFaction(target, options),
  };

  const allowed = options.canTarget?.(context);
  if (allowed !== undefined) return allowed;

  return matchesActionBattleTargetSelector(selector, context);
};

export const getActionBattleEntitiesInRange = (
  attacker: ActionBattleEntity,
  radius: number,
  selector: ActionBattleTargetSelector | undefined,
  options: ActionBattleTargetOptions = {}
): ActionBattleEntity[] => {
  const map = (attacker as any).getCurrentMap?.();
  if (!map) return [];

  const candidates: ActionBattleEntity[] = [];
  map.getPlayers?.().forEach((player: RpgPlayer) => candidates.push(player));
  map.getEvents?.().forEach((event: RpgEvent) => candidates.push(event));

  return candidates.filter((candidate) => {
    if (!canActionBattleTarget(attacker, candidate, selector, options)) {
      return false;
    }
    const dx = (attacker as any).x() - (candidate as any).x();
    const dy = (attacker as any).y() - (candidate as any).y();
    return Math.sqrt(dx * dx + dy * dy) <= radius;
  });
};
