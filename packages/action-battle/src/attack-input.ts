export type ActionBattleResolvedDirection = "up" | "down" | "left" | "right";

const ACTION_BATTLE_DIRECTIONS = new Set([
  "up",
  "down",
  "left",
  "right",
]);

const normalizeDirection = (
  value: unknown
): ActionBattleResolvedDirection | undefined => {
  if (typeof value !== "string") return undefined;
  return ACTION_BATTLE_DIRECTIONS.has(value)
    ? (value as ActionBattleResolvedDirection)
    : undefined;
};

export const resolveActionBattleAttackDirection = (
  entity: any,
  input?: any
): ActionBattleResolvedDirection => {
  const payloadDirection =
    normalizeDirection(input?.data?.direction) ??
    normalizeDirection(input?.data?.attackDirection) ??
    normalizeDirection(input?.direction);
  if (payloadDirection) return payloadDirection;

  if (typeof entity?.getDirection === "function") {
    const direction = normalizeDirection(entity.getDirection());
    if (direction) return direction;
  }

  if (typeof entity?.direction === "function") {
    const direction = normalizeDirection(entity.direction());
    if (direction) return direction;
  }

  return normalizeDirection(entity?.direction) ?? "down";
};

export const applyActionBattleAttackDirection = (
  entity: any,
  direction: ActionBattleResolvedDirection
) => {
  if (typeof entity?.changeDirection === "function") {
    const previousDirectionFixed = entity.directionFixed;
    if (previousDirectionFixed === true) {
      entity.directionFixed = false;
    }
    try {
      entity.changeDirection(direction);
    } finally {
      if (previousDirectionFixed === true) {
        entity.directionFixed = previousDirectionFixed;
      }
    }
  }
};
