import type {
  AreaShapeOffset,
  MapAreaCenter,
  MapAreaFalloff,
  MapAreaPoint,
} from "./types";
import type { MapHitboxQueryRect } from "../Map";

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const readNumber = (
  value: number | (() => number) | undefined,
  fallback = 0
) => (typeof value === "function" ? value() : value ?? fallback);

export const normalizeHitbox = (target: any) => {
  const hitbox = typeof target?.hitbox === "function" ? target.hitbox() : target?.hitbox;
  const width = hitbox?.w ?? hitbox?.width ?? target?.width ?? 0;
  const height = hitbox?.h ?? hitbox?.height ?? target?.height ?? 0;
  return { width, height };
};

export const resolveAreaPoint = (center: MapAreaCenter): MapAreaPoint => {
  const x = readNumber((center as any).x);
  const y = readNumber((center as any).y);
  const { width, height } = normalizeHitbox(center);
  return {
    x: x + width / 2,
    y: y + height / 2,
  };
};

export const boundsFromCenter = (
  center: MapAreaPoint,
  width: number,
  height: number
): MapHitboxQueryRect => ({
  x: center.x - width / 2,
  y: center.y - height / 2,
  width,
  height,
});

export const offsetCenter = (
  center: MapAreaPoint,
  offset?: AreaShapeOffset
): MapAreaPoint => ({
  x: center.x + (offset?.x ?? 0),
  y: center.y + (offset?.y ?? 0),
});

export const pointInRect = (
  point: MapAreaPoint,
  rect: MapHitboxQueryRect
): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;

export const rectsIntersect = (
  a: MapHitboxQueryRect,
  b: MapHitboxQueryRect
): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

export const distance = (a: MapAreaPoint, b: MapAreaPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const maxDistanceFromBounds = (
  center: MapAreaPoint,
  bounds: MapHitboxQueryRect
): number => {
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ];
  return Math.max(...corners.map((corner) => distance(center, corner)), 0);
};

export const rotatePoint = (point: MapAreaPoint, angle: number): MapAreaPoint => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
};

export const createFalloff = (
  distance: number,
  maxDistance: number
): MapAreaFalloff => {
  const ratio = maxDistance > 0 ? clamp01(distance / maxDistance) : 0;
  return {
    linear: () => clamp01(1 - ratio),
    inverse: () => (maxDistance > 0 ? 1 / (1 + ratio) : 1),
    step: (thresholds = [0.33, 0.66]) => {
      const sorted = [...thresholds].sort((a, b) => a - b);
      const bucket = sorted.findIndex((threshold) => ratio <= threshold);
      if (bucket === -1) return 0;
      return clamp01(1 - bucket / (sorted.length + 1));
    },
  };
};
