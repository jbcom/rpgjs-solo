import {
  ActionBattleAoeMask,
  ActionBattleSoftTargetingOptions,
  ActionBattleUiTargetingOptions,
} from "./types";
import type { ActionBattleResolvedDirection } from "./attack-input";
import {
  AABBCollider,
  Entity,
  Vector2,
  capsuleCastCollider,
  raycastCollider,
} from "@rpgjs/common";

export interface ParsedAoeMask {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  cells: Array<{ dx: number; dy: number }>;
}

export interface ActionBattleTilePoint {
  x: number;
  y: number;
}

export interface ActionBattleTileSize {
  width: number;
  height: number;
}

export type ActionBattleWorldDirection =
  | ActionBattleResolvedDirection
  | { x: number; y: number };

export const getActionBattleDirectionVector = (
  direction: ActionBattleWorldDirection,
): { x: number; y: number } => {
  if (typeof direction === "string") {
    if (direction === "up") return { x: 0, y: -1 };
    if (direction === "left") return { x: -1, y: 0 };
    if (direction === "right") return { x: 1, y: 0 };
    return { x: 0, y: 1 };
  }

  const distance = Math.hypot(direction.x, direction.y);
  if (!Number.isFinite(distance) || distance <= 0) {
    return { x: 0, y: 1 };
  }
  return {
    x: direction.x / distance,
    y: direction.y / distance,
  };
};

/**
 * Convert a Manhattan range expressed in map tiles into world-pixel travel
 * along the supplied direction. Rectangular tiles therefore preserve the same
 * targeting boundary for horizontal, vertical, and diagonal projectiles.
 */
export const getActionBattleDirectionalTileRange = (
  range: number,
  tileSize: ActionBattleTileSize,
  direction: ActionBattleWorldDirection,
): number => {
  if (!Number.isFinite(range) || range <= 0) return 0;
  const vector = getActionBattleDirectionVector(direction);
  const tilesPerPixel =
    Math.abs(vector.x) / tileSize.width
    + Math.abs(vector.y) / tileSize.height;
  return tilesPerPixel > 0 ? range / tilesPerPixel : 0;
};

const normalizeMaskRows = (mask: ActionBattleAoeMask | undefined): string[] => {
  if (!mask) return ["#"];
  if (Array.isArray(mask)) return mask;
  return mask
    .trim()
    .split("\n")
    .map((row) => row.replace(/\r/g, ""));
};

export const parseAoeMask = (mask: ActionBattleAoeMask | undefined): ParsedAoeMask => {
  const rows = normalizeMaskRows(mask);
  const height = rows.length;
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const cells: Array<{ dx: number; dy: number }> = [];

  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const char = row[x];
      if (char && char !== "." && char !== " " && char !== "0") {
        cells.push({ dx: x - centerX, dy: y - centerY });
      }
    }
  });

  if (cells.length === 0) {
    cells.push({ dx: 0, dy: 0 });
  }

  return { width, height, centerX, centerY, cells };
};

export const manhattanDistance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const positiveDimension = (value: unknown): number | undefined => {
  const resolved = typeof value === "function" ? value() : value;
  const number = Number(resolved);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

export const getActionBattleTileSize = (
  map: any,
  override?: Partial<ActionBattleTileSize>,
): ActionBattleTileSize => {
  const data = typeof map?.data === "function" ? map.data() : map?.data;
  return {
    width:
      positiveDimension(override?.width)
      ?? positiveDimension(map?.tileWidth)
      ?? positiveDimension(data?.tileWidth ?? data?.parsedMap?.tilewidth)
      ?? 32,
    height:
      positiveDimension(override?.height)
      ?? positiveDimension(map?.tileHeight)
      ?? positiveDimension(data?.tileHeight ?? data?.parsedMap?.tileheight)
      ?? 32,
  };
};

export const getActionBattleTargetingTileSize = (
  map: any,
  targeting: boolean | ActionBattleUiTargetingOptions | undefined,
): ActionBattleTileSize =>
  getActionBattleTileSize(
    map,
    targeting && typeof targeting === "object"
      ? targeting.tileSize
      : undefined,
  );

export const getActionBattleEntityTile = (
  entity: any,
  tileSize: ActionBattleTileSize
): ActionBattleTilePoint => {
  const hitbox = entity.hitbox?.() ?? {
    w: tileSize.width,
    h: tileSize.height,
  };
  return {
    x: Math.floor((entity.x() + (hitbox.w ?? tileSize.width) / 2) / tileSize.width),
    y: Math.floor((entity.y() + (hitbox.h ?? tileSize.height) / 2) / tileSize.height),
  };
};

export const resolveActionBattleAoeCells = (
  targetTile: ActionBattleTilePoint,
  mask: ActionBattleAoeMask | undefined
): ActionBattleTilePoint[] =>
  parseAoeMask(mask).cells.map((cell) => ({
    x: targetTile.x + cell.dx,
    y: targetTile.y + cell.dy,
  }));

/**
 * Find a legal cast center whose area mask covers the desired target tile.
 * Prefer centering the mask on the target, then the closest legal center.
 */
export const resolveActionBattleAoeTarget = (
  origin: ActionBattleTilePoint,
  desiredTarget: ActionBattleTilePoint,
  range: number,
  mask: ActionBattleAoeMask | undefined
): ActionBattleTilePoint | null => {
  const candidates = parseAoeMask(mask).cells
    .map((cell) => ({
      target: {
        x: desiredTarget.x - cell.dx,
        y: desiredTarget.y - cell.dy,
      },
      offsetDistance: Math.abs(cell.dx) + Math.abs(cell.dy),
    }))
    .filter(({ target }) => manhattanDistance(origin, target) <= range)
    .sort((left, right) => {
      if (left.offsetDistance !== right.offsetDistance) {
        return left.offsetDistance - right.offsetDistance;
      }
      return (
        manhattanDistance(origin, left.target) -
        manhattanDistance(origin, right.target)
      );
    });

  return candidates[0]?.target ?? null;
};

type SoftTargetEntity = {
  id?: string;
  x: () => number;
  y: () => number;
  hitbox?: () => { w?: number; h?: number };
  getDirection?: () => ActionBattleResolvedDirection;
  battleAi?: {
    getTarget?: () => SoftTargetEntity | null;
  };
};

export type ActionBattleProjectileGeometryInput = {
  source: SoftTargetEntity;
  target?: SoftTargetEntity | null;
  projectile?: {
    origin?: { x: number; y: number };
    direction?: ActionBattleWorldDirection;
    range?: number;
    trajectory?: { range?: number };
    collision?: {
      radius?: number;
      width?: number;
      height?: number;
    };
  };
  actionRange?: number;
  targetingRange?: number;
  tileSize: ActionBattleTileSize;
};

export interface ActionBattleProjectileGeometry {
  origin: { x: number; y: number };
  direction: { x: number; y: number };
  range: number;
  radius: number;
  width: number;
  shape: "ray" | "capsule";
}

export const getActionBattleEntityCenter = (entity: SoftTargetEntity) => {
  const hitbox = entity.hitbox?.() ?? {};
  return {
    x: entity.x() + (hitbox.w ?? 0) / 2,
    y: entity.y() + (hitbox.h ?? 0) / 2,
  };
};

export const getActionBattleTargetVector = (
  source: SoftTargetEntity,
  target: SoftTargetEntity,
) => {
  const from = getActionBattleEntityCenter(source);
  const to = getActionBattleEntityCenter(target);
  const x = to.x - from.x;
  const y = to.y - from.y;
  const distance = Math.hypot(x, y);
  return {
    x,
    y,
    distance,
    direction: getActionBattleDirectionVector({ x, y }),
  };
};

export const resolveActionBattleProjectileDirection = (
  source: SoftTargetEntity,
  target?: SoftTargetEntity | null,
  configuredDirection?: ActionBattleWorldDirection,
) =>
  getActionBattleDirectionVector(
    configuredDirection ??
      (target ? getActionBattleTargetVector(source, target).direction : undefined) ??
      source.getDirection?.() ??
      "down",
  );

const finitePositive = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const finitePoint = (
  value: unknown,
): { x: number; y: number } | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const point = value as { x?: unknown; y?: unknown };
  const x = Number(point.x);
  const y = Number(point.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
};

/**
 * Resolve exactly the origin, normalized direction, travel range, and collision
 * shape passed to the authoritative projectile emitter.
 */
export const resolveActionBattleProjectileGeometry = (
  input: ActionBattleProjectileGeometryInput,
): ActionBattleProjectileGeometry => {
  const projectile = input.projectile ?? {};
  const origin = finitePoint(projectile.origin)
    ?? getActionBattleEntityCenter(input.source);
  const targetCenter = input.target
    ? getActionBattleEntityCenter(input.target)
    : undefined;
  const inferredDirection = targetCenter
    ? { x: targetCenter.x - origin.x, y: targetCenter.y - origin.y }
    : undefined;
  const direction = getActionBattleDirectionVector(
    projectile.direction
      ?? inferredDirection
      ?? input.source.getDirection?.()
      ?? "down",
  );
  const directionalTargetingRange = finitePositive(input.targetingRange) !== undefined
    ? getActionBattleDirectionalTileRange(
        input.targetingRange!,
        input.tileSize,
        direction,
      )
    : undefined;
  const range =
    finitePositive(projectile.trajectory?.range)
    ?? finitePositive(projectile.range)
    ?? finitePositive(input.actionRange)
    ?? directionalTargetingRange
    ?? 160;
  const collision = projectile.collision ?? {};
  const configuredRadius = finitePositive(collision.radius);
  const configuredWidth = Math.max(
    finitePositive(collision.width) ?? 0,
    finitePositive(collision.height) ?? 0,
  );
  const radius = configuredRadius ?? configuredWidth / 2;

  return {
    origin,
    direction,
    range,
    radius,
    width: radius * 2,
    shape: radius > 0 ? "capsule" : "ray",
  };
};

export const getActionBattleProjectileTargetIntersection = (
  geometry: ActionBattleProjectileGeometry,
  target: SoftTargetEntity,
  map?: any,
) => {
  const origin = new Vector2(geometry.origin.x, geometry.origin.y);
  const direction = new Vector2(geometry.direction.x, geometry.direction.y);
  const physics = map?.physic;
  if (
    target.id &&
    physics &&
    typeof physics.raycast === "function"
  ) {
    const filter = (entity: { uuid?: string }) => entity.uuid === target.id;
    return geometry.radius > 0 && typeof physics.capsuleCast === "function"
      ? physics.capsuleCast(
          origin,
          direction,
          geometry.range,
          geometry.radius,
          undefined,
          filter,
        )
      : physics.raycast(
          origin,
          direction,
          geometry.range,
          undefined,
          filter,
        );
  }

  // Lightweight harnesses may not own a map world. Reuse the same canonical
  // collider ray/capsule primitives against the target's synchronized AABB.
  const hitbox = target.hitbox?.() ?? {};
  const center = getActionBattleEntityCenter(target);
  const entity = new Entity({
    uuid: target.id,
    position: center,
    width: finitePositive(hitbox.w) ?? 0,
    height: finitePositive(hitbox.h) ?? 0,
  });
  const collider = new AABBCollider(entity);
  return geometry.radius > 0
    ? capsuleCastCollider(
        collider,
        origin,
        direction,
        geometry.range,
        geometry.radius,
      )
    : raycastCollider(collider, origin, direction, geometry.range);
};

/**
 * Return a finite cast length that reaches beyond every point of the target's
 * synchronized AABB. This is used only to distinguish an aligned target that
 * is out of range from one the projectile can never intersect; it must never
 * become an unbounded world broad-phase query.
 */
export const getActionBattleProjectileTargetProofRange = (
  geometry: ActionBattleProjectileGeometry,
  target: SoftTargetEntity,
): number => {
  const center = getActionBattleEntityCenter(target);
  const hitbox = target.hitbox?.() ?? {};
  const width = Math.max(0, Number(hitbox.w) || 0);
  const height = Math.max(0, Number(hitbox.h) || 0);
  const centerDistance = Math.hypot(
    center.x - geometry.origin.x,
    center.y - geometry.origin.y,
  );
  if (!Number.isFinite(centerDistance)) return geometry.range;
  return centerDistance + Math.hypot(width, height) / 2 + geometry.radius;
};

export const getActionBattleTargetTrajectory = (
  source: SoftTargetEntity,
  target: SoftTargetEntity,
  configuredDirection?: ActionBattleWorldDirection,
) => {
  const vector = getActionBattleTargetVector(source, target);
  const geometry = resolveActionBattleProjectileGeometry({
    source,
    target,
    projectile: {
      direction: configuredDirection,
      trajectory: { range: Number.MAX_SAFE_INTEGER },
    },
    tileSize: { width: 32, height: 32 },
  });
  const direction = geometry.direction;
  const forwardDistance =
    vector.x * direction.x + vector.y * direction.y;
  const lateralDistance = Math.abs(
    vector.x * direction.y - vector.y * direction.x,
  );
  const hit = getActionBattleProjectileTargetIntersection(
    geometry,
    target,
  );
  return {
    ...vector,
    direction,
    forwardDistance,
    lateralDistance,
    aligned: hit !== null,
  };
};

export interface ActionBattleDirectionalTargetBoundary {
  tileRange: number;
  tileSize: ActionBattleTileSize;
  direction?: ActionBattleWorldDirection;
  projectile?: ActionBattleProjectileGeometryInput["projectile"];
  actionRange?: number;
  geometry?: ActionBattleProjectileGeometry;
  map?: any;
}

export const getActionBattleDirectionalTargetBoundary = (
  source: SoftTargetEntity,
  target: SoftTargetEntity,
  boundary: ActionBattleDirectionalTargetBoundary,
) => {
  const trajectory = getActionBattleTargetVector(source, target);
  const geometry = boundary.geometry ?? resolveActionBattleProjectileGeometry({
    source,
    target,
    projectile: {
      ...boundary.projectile,
      direction: boundary.projectile?.direction ?? boundary.direction,
    },
    actionRange: boundary.actionRange,
    targetingRange: boundary.tileRange,
    tileSize: boundary.tileSize,
  });
  const hit = getActionBattleProjectileTargetIntersection(
    geometry,
    target,
    boundary.map,
  );
  return {
    ...trajectory,
    direction: geometry.direction,
    forwardDistance:
      trajectory.x * geometry.direction.x
      + trajectory.y * geometry.direction.y,
    lateralDistance: Math.abs(
      trajectory.x * geometry.direction.y
      - trajectory.y * geometry.direction.x,
    ),
    range: geometry.range,
    aligned: hit !== null,
    eligible: hit !== null,
    physical: true,
    hitDistance: hit?.distance,
  };
};

export interface ActionBattleSoftTargetResult<T> {
  target: T;
  direction: ActionBattleResolvedDirection;
  score: number;
  distance: number;
}

export const directionToActionBattleTarget = (
  source: SoftTargetEntity,
  target: SoftTargetEntity
): ActionBattleResolvedDirection => {
  const { x: dx, y: dy } = getActionBattleTargetVector(source, target);
  return Math.abs(dx) >= Math.abs(dy)
    ? dx >= 0
      ? "right"
      : "left"
    : dy >= 0
      ? "down"
      : "up";
};

/**
 * Pick a contextual melee target without moving the player.
 *
 * Manual facing remains the strongest signal. Distance and enemies currently
 * focused on the player break ties so crowded fights remain readable.
 */
export const resolveActionBattleSoftTarget = <T extends SoftTargetEntity>(
  source: SoftTargetEntity,
  candidates: T[],
  direction: ActionBattleWorldDirection,
  options: ActionBattleSoftTargetingOptions = {},
  directionalBoundary?: ActionBattleDirectionalTargetBoundary,
): ActionBattleSoftTargetResult<T> | null => {
  const configuredRange = Math.max(1, options.range ?? 112);
  const coneDegrees = Math.max(0, Math.min(360, options.coneDegrees ?? 110));
  const directionWeight = Math.max(0, options.directionWeight ?? 0.48);
  const distanceWeight = Math.max(0, options.distanceWeight ?? 0.32);
  const threatWeight = Math.max(0, options.threatWeight ?? 0.2);
  const facing = getActionBattleDirectionVector(direction);
  let best: ActionBattleSoftTargetResult<T> | null = null;

  for (const target of candidates) {
    if (target === source) continue;
    const targetBoundary = directionalBoundary
      ? getActionBattleDirectionalTargetBoundary(
          source,
          target,
          directionalBoundary,
        )
      : undefined;
    const vector = targetBoundary ?? getActionBattleTargetVector(source, target);
    const { x: dx, y: dy, distance } = vector;
    const candidateRange = targetBoundary?.range ?? configuredRange;
    if (
      targetBoundary
        ? !targetBoundary.eligible
        : distance <= 0 || distance > candidateRange
    ) {
      continue;
    }
    const dot = distance <= 0
      ? 1
      : Math.max(
          -1,
          Math.min(1, (facing.x * dx + facing.y * dy) / distance)
        );
    const angle = Math.acos(dot) * (180 / Math.PI);
    if (!targetBoundary?.physical && angle > coneDegrees / 2) continue;
    const directionScore = (dot + 1) / 2;
    const distanceScore = Math.max(0, 1 - distance / candidateRange);
    const threatScore =
      target.battleAi?.getTarget?.()?.id === source.id ? 1 : 0;
    const score =
      directionScore * directionWeight +
      distanceScore * distanceWeight +
      threatScore * threatWeight;
    if (!best || score > best.score) {
      best = {
        target,
        direction: directionToActionBattleTarget(source, target),
        score,
        distance,
      };
    }
  }

  return best;
};
