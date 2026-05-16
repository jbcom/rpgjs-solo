export const readPropValue = <T = unknown>(value: unknown): T => {
  if (typeof value === "function") {
    return readPropValue((value as () => unknown)());
  }

  if (value && typeof value === "object" && "value" in value) {
    return readPropValue((value as { value: unknown }).value);
  }

  return value as T;
};

export const getCanMoveValue = (entity: any): boolean => {
  const value = readPropValue(entity?._canMove ?? entity?.canMove);
  return value !== false;
};
