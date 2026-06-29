export type CharacterHitbox = {
  w: number;
  h: number;
  anchorMode?: "top-left" | "center" | "foot";
};

export const toPositiveNumber = (value: unknown): number | undefined => {
  const number = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const clampRatio = (value: number): number => Math.min(1, Math.max(0, value));

export const scaleHitboxForGraphicDisplay = (
  box: CharacterHitbox | null | undefined,
  scale: [number, number],
): CharacterHitbox | null => {
  if (!box) return null;
  const scaleX = Math.abs(toPositiveNumber(scale[0]) ?? 1);
  const scaleY = Math.abs(toPositiveNumber(scale[1]) ?? scaleX);

  return {
    ...box,
    w: box.w / scaleX,
    h: box.h / scaleY,
  };
};

export const resolveHitboxAnchor = (
  spriteWidth: number | undefined,
  spriteHeight: number | undefined,
  realSize: number | { height?: number } | undefined,
  box: CharacterHitbox | null | undefined,
): [number, number] => {
  if (!spriteWidth || !spriteHeight || !box) {
    return [0, 0];
  }

  const heightOfSprite = typeof realSize === "number" ? realSize : realSize?.height;
  const resolvedHeight = toPositiveNumber(heightOfSprite) ?? spriteHeight;
  const gap = Math.max(0, (spriteHeight - resolvedHeight) / 2);
  const hitboxTopLeftX = clampRatio((spriteWidth - box.w) / 2 / spriteWidth);
  const hitboxTopLeftY = clampRatio((spriteHeight - box.h - gap) / spriteHeight);
  const hitboxCenterX = clampRatio(hitboxTopLeftX + box.w / 2 / spriteWidth);
  const hitboxCenterY = clampRatio(hitboxTopLeftY + box.h / 2 / spriteHeight);
  const footY = clampRatio((spriteHeight - gap) / spriteHeight);

  switch (box.anchorMode ?? "top-left") {
    case "center":
      return [hitboxCenterX, hitboxCenterY];
    case "foot":
      return [hitboxCenterX, footY];
    case "top-left":
    default:
      return [hitboxTopLeftX, hitboxTopLeftY];
  }
};

export const resolveScaledHitboxAnchor = (
  spriteWidth: number | undefined,
  spriteHeight: number | undefined,
  realSize: number | { height?: number } | undefined,
  box: CharacterHitbox | null | undefined,
  scale: [number, number],
): [number, number] => {
  return resolveHitboxAnchor(
    spriteWidth,
    spriteHeight,
    realSize,
    scaleHitboxForGraphicDisplay(box, scale),
  );
};
