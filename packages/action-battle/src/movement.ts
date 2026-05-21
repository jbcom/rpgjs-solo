const UNRESOLVED_ENTITY_MESSAGE = "unable to resolve entity";

export type ActionBattleDashEntity = {
  id?: string;
  getCurrentMap?: () => any;
  dash?: (
    direction: { x: number; y: number },
    additionalSpeed?: number,
    duration?: number
  ) => unknown;
};

export const isActionBattleMovementResolutionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes(UNRESOLVED_ENTITY_MESSAGE);
};

export const hasActionBattlePhysicsBody = (
  entity: ActionBattleDashEntity | null | undefined
): boolean => {
  if (!entity) return false;
  const map = entity.getCurrentMap?.();
  if (!map) return false;
  if (typeof map.getBody !== "function" || !entity.id) return true;
  return Boolean(map.getBody(entity.id));
};

export const safeActionBattleDash = (
  entity: ActionBattleDashEntity | null | undefined,
  direction: { x: number; y: number },
  additionalSpeed?: number,
  duration?: number
): boolean => {
  if (!entity || typeof entity.dash !== "function") return false;
  if (!hasActionBattlePhysicsBody(entity)) return false;

  try {
    entity.dash(direction, additionalSpeed, duration);
    return true;
  } catch (error) {
    if (isActionBattleMovementResolutionError(error)) {
      return false;
    }
    throw error;
  }
};
