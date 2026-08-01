import { Vector2 } from '../core/math/Vector2';
import { AABB } from '../core/math/AABB';
import { SpatialPartition } from '../world/SpatialPartition';
import { Ray, type RaycastHit } from './Ray';
import { AABBCollider } from './AABBCollider';
import { CircleCollider } from './CircleCollider';
import { PolygonCollider } from './PolygonCollider';
import { CapsuleCollider } from './CapsuleCollider';
import { createCollider } from './detector';
import { Collider } from './Collider';

export type { RaycastHit } from './Ray';

/**
 * Casts a ray in the world using the spatial partition for broad-phase, then shape-specific narrow-phase.
 * Direction will be normalized internally.
 *
 * @param partition - Spatial partition to query
 * @param origin - Ray origin
 * @param direction - Ray direction (any length)
 * @param maxDistance - Maximum distance
 * @param mask - Optional collision mask (layer)
 * @param filter - Optional filter function (return true to include entity)
 * @returns Nearest hit or null
 *
 * @example
 * ```typescript
 * const hit = raycast(worldPartition, new Vector2(0,0), new Vector2(1,0), 1000);
 * if (hit) {
 *   // handle
 * }
 * ```
 */
export function raycast(partition: SpatialPartition, origin: Vector2, direction: Vector2, maxDistance: number, mask?: number, filter?: (entity: any) => boolean): RaycastHit | null {
  const dir = direction.length() > 0 ? direction.normalize() : new Vector2(1, 0);
  const end = origin.add(dir.mul(maxDistance));
  const candidates = partition.raycast(new Ray(origin, dir, maxDistance), mask, filter);
  if (candidates) return candidates;

  // Fallback if partition doesn't implement raycast (shouldn't happen with SpatialHash)
  // But for generic SpatialPartition, we might need the old AABB query method
  const bounds = new AABB(
    Math.min(origin.x, end.x),
    Math.min(origin.y, end.y),
    Math.max(origin.x, end.x),
    Math.max(origin.y, end.y)
  );

  const entities = partition.queryAABB(bounds);
  let best: RaycastHit | null = null;

  for (const e of entities) {
    if (mask !== undefined && (e.collisionCategory & mask) === 0) continue;
    if (filter && !filter(e)) continue;
    const collider = createCollider(e);
    if (!collider) continue;
    const hit = raycastCollider(collider, origin, dir, maxDistance);
    if (!hit) continue;
    if (!best || hit.distance < best.distance) best = hit;
  }

  return best;
}

/**
 * Sweep a circular projectile along a segment. This is the Minkowski-sum
 * equivalent of casting a capsule against world colliders and is the same
 * primitive used by authoritative projectile simulation when radius is set.
 */
export function capsuleCast(
  partition: SpatialPartition,
  origin: Vector2,
  direction: Vector2,
  maxDistance: number,
  radius: number,
  mask?: number,
  filter?: (entity: any) => boolean,
): RaycastHit | null {
  const normalizedRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  if (normalizedRadius === 0) {
    return raycast(partition, origin, direction, maxDistance, mask, filter);
  }

  const dir = direction.length() > 0 ? direction.normalize() : new Vector2(1, 0);
  const end = origin.add(dir.mul(maxDistance));
  const candidates = partition.queryAABB(new AABB(
    Math.min(origin.x, end.x) - normalizedRadius,
    Math.min(origin.y, end.y) - normalizedRadius,
    Math.max(origin.x, end.x) + normalizedRadius,
    Math.max(origin.y, end.y) + normalizedRadius,
  ));
  let best: RaycastHit | null = null;

  for (const entity of candidates) {
    if (mask !== undefined && (entity.collisionCategory & mask) === 0) continue;
    if (filter && !filter(entity)) continue;
    const collider = createCollider(entity);
    if (!collider) continue;
    const hit = capsuleCastCollider(
      collider,
      origin,
      dir,
      maxDistance,
      normalizedRadius,
    );
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  return best;
}

export function raycastCollider(collider: Collider, origin: Vector2, dir: Vector2, maxDistance: number): RaycastHit | null {
  const direction = dir.length() > 0 ? dir.normalize() : new Vector2(1, 0);
  if (collider instanceof CircleCollider) return raycastCircle(collider, origin, direction, maxDistance);
  if (collider instanceof AABBCollider) return raycastAABB(collider, origin, direction, maxDistance);
  if (collider instanceof CapsuleCollider) return raycastCapsule(collider, origin, direction, maxDistance);
  if (collider instanceof PolygonCollider) return raycastPolygon(collider, origin, direction, maxDistance);
  return null;
}

export function capsuleCastCollider(
  collider: Collider,
  origin: Vector2,
  dir: Vector2,
  maxDistance: number,
  radius: number,
): RaycastHit | null {
  const direction = dir.length() > 0 ? dir.normalize() : new Vector2(1, 0);
  if (radius <= 0) return raycastCollider(collider, origin, direction, maxDistance);
  if (collider instanceof CircleCollider) {
    return raycastCircle(collider, origin, direction, maxDistance, radius);
  }
  if (collider instanceof AABBCollider) {
    return raycastExpandedAABB(collider, origin, direction, maxDistance, radius);
  }
  if (collider instanceof CapsuleCollider) {
    return raycastCapsule(collider, origin, direction, maxDistance, radius);
  }
  if (collider instanceof PolygonCollider) {
    return raycastExpandedPolygon(collider, origin, direction, maxDistance, radius);
  }
  return null;
}

function raycastCircle(circle: CircleCollider, origin: Vector2, dir: Vector2, maxDistance: number, expansion = 0): RaycastHit | null {
  return raycastCircleShape(
    circle.getEntity(),
    circle.getCenter(),
    circle.getRadius() + expansion,
    origin,
    dir,
    maxDistance,
  );
}

function raycastCircleShape(
  entity: ReturnType<Collider['getEntity']>,
  center: Vector2,
  radius: number,
  origin: Vector2,
  dir: Vector2,
  maxDistance: number,
): RaycastHit | null {
  const m = origin.sub(center);
  const b = m.dot(dir);
  const cval = m.dot(m) - radius * radius;
  if (cval > 0 && b > 0) return null; // ray origin outside and pointing away
  const discr = b * b - cval;
  if (discr < 0) return null;
  const t = Math.max(0, -b - Math.sqrt(discr));
  if (t > maxDistance) return null;
  const point = origin.add(dir.mul(t));
  const normal = point.sub(center).normalize();
  return { entity, point, normal, distance: t };
}

function raycastAABB(box: AABBCollider, origin: Vector2, dir: Vector2, maxDistance: number): RaycastHit | null {
  return raycastBounds(box.getEntity(), box.getBounds(), origin, dir, maxDistance);
}

const nearestHit = (
  hits: Array<RaycastHit | null>,
): RaycastHit | null =>
  hits.reduce<RaycastHit | null>(
    (nearest, hit) => hit && (!nearest || hit.distance < nearest.distance)
      ? hit
      : nearest,
    null,
  );

const overlapHit = (
  entity: ReturnType<Collider['getEntity']>,
  origin: Vector2,
  dir: Vector2,
): RaycastHit => ({
  entity,
  point: origin.clone(),
  normal: dir.length() > 0 ? dir.normalize().mul(-1) : new Vector2(-1, 0),
  distance: 0,
});

function raycastExpandedAABB(
  box: AABBCollider,
  origin: Vector2,
  dir: Vector2,
  maxDistance: number,
  radius: number,
): RaycastHit | null {
  const entity = box.getEntity();
  const bounds = box.getBounds();
  if (bounds.contains(origin)) return overlapHit(entity, origin, dir);
  const corners = [
    new Vector2(bounds.minX, bounds.minY),
    new Vector2(bounds.maxX, bounds.minY),
    new Vector2(bounds.maxX, bounds.maxY),
    new Vector2(bounds.minX, bounds.maxY),
  ];
  return nearestHit(corners.map((corner, index) =>
    raycastSegmentCapsule(
      entity,
      corner,
      corners[(index + 1) % corners.length]!,
      radius,
      origin,
      dir,
      maxDistance,
    ),
  ));
}

function raycastCapsule(
  capsule: CapsuleCollider,
  origin: Vector2,
  dir: Vector2,
  maxDistance: number,
  expansion = 0,
): RaycastHit | null {
  const segment = capsule.getSegment();
  const config = capsule.getCapsuleConfig();
  return raycastSegmentCapsule(
    capsule.getEntity(),
    segment.a,
    segment.b,
    config.radius + expansion,
    origin,
    dir,
    maxDistance,
  );
}

function raycastSegmentCapsule(
  entity: ReturnType<Collider['getEntity']>,
  start: Vector2,
  end: Vector2,
  radius: number,
  origin: Vector2,
  dir: Vector2,
  maxDistance: number,
): RaycastHit | null {
  const segment = end.sub(start);
  const length = segment.length();
  if (length <= Number.EPSILON) {
    return raycastCircleShape(
      entity,
      start,
      radius,
      origin,
      dir,
      maxDistance,
    );
  }

  const axis = segment.mul(1 / length);
  const perpendicular = new Vector2(-axis.y, axis.x);
  const relativeOrigin = origin.sub(start);
  const localOrigin = new Vector2(
    relativeOrigin.dot(axis),
    relativeOrigin.dot(perpendicular),
  );
  const localDirection = new Vector2(
    dir.dot(axis),
    dir.dot(perpendicular),
  );
  const rectangleHit = raycastBounds(
    entity,
    new AABB(0, -radius, length, radius),
    localOrigin,
    localDirection,
    maxDistance,
  );
  if (rectangleHit) {
    rectangleHit.point = start
      .add(axis.mul(rectangleHit.point.x))
      .add(perpendicular.mul(rectangleHit.point.y));
    rectangleHit.normal = axis
      .mul(rectangleHit.normal.x)
      .add(perpendicular.mul(rectangleHit.normal.y));
  }
  return nearestHit([
    rectangleHit,
    raycastCircleShape(entity, start, radius, origin, dir, maxDistance),
    raycastCircleShape(entity, end, radius, origin, dir, maxDistance),
  ]);
}

function raycastBounds(
  entity: ReturnType<Collider['getEntity']>,
  b: AABB,
  origin: Vector2,
  dir: Vector2,
  maxDistance: number,
): RaycastHit | null {
  let tmin = 0;
  let tmax = maxDistance;
  let normal = dir.length() > 0
    ? dir.normalize().mul(-1)
    : new Vector2(-1, 0);

  const applySlab = (
    coordinate: number,
    component: number,
    minimum: number,
    maximum: number,
    nearNormal: Vector2,
    farNormal: Vector2,
  ) => {
    if (Math.abs(component) <= Number.EPSILON) {
      return coordinate >= minimum && coordinate <= maximum;
    }
    const first = (minimum - coordinate) / component;
    const second = (maximum - coordinate) / component;
    const near = Math.min(first, second);
    const far = Math.max(first, second);
    const candidateNormal = first <= second ? nearNormal : farNormal;
    if (near > tmin) {
      tmin = near;
      normal = candidateNormal;
    }
    tmax = Math.min(tmax, far);
    return tmax >= tmin;
  };

  if (!applySlab(
    origin.x,
    dir.x,
    b.minX,
    b.maxX,
    new Vector2(-1, 0),
    new Vector2(1, 0),
  )) return null;
  if (!applySlab(
    origin.y,
    dir.y,
    b.minY,
    b.maxY,
    new Vector2(0, -1),
    new Vector2(0, 1),
  )) return null;
  if (tmin < 0 || tmin > maxDistance) return null;

  const point = origin.add(dir.mul(tmin));
  return { entity, point, normal, distance: tmin };
}

function raycastPolygon(poly: PolygonCollider, origin: Vector2, dir: Vector2, maxDistance: number): RaycastHit | null {
  // Cast ray against all edges; take nearest positive distance
  // We approximate normal as the edge normal pointing outward
  const parts = getPolygonWorldParts(poly);
  if (parts.some((part) => pointInPolygon(origin, part))) {
    return overlapHit(poly.getEntity(), origin, dir);
  }
  const end = origin.add(dir.mul(maxDistance));
  let bestT = Number.POSITIVE_INFINITY;
  let bestPoint: Vector2 | null = null;
  let bestNormal: Vector2 | null = null;

  // Access world vertices via getBounds + transform approximation would be inefficient; use internal helper via casting
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      const a = part[i];
      const b = part[(i + 1) % part.length];
      if (!a || !b) continue;
      const hit = segmentRayIntersection(a, b, origin, end);
      if (!hit) continue;
      const t = hit.distance;
      if (t >= 0 && t <= maxDistance && t < bestT) {
        bestT = t;
        bestPoint = hit.point;
        const edge = b.sub(a);
        const n = new Vector2(-edge.y, edge.x).normalize();
        bestNormal = n;
      }
    }
  }

  if (!bestPoint || !bestNormal || bestT === Number.POSITIVE_INFINITY) return null;
  return { entity: poly.getEntity(), point: bestPoint, normal: bestNormal, distance: bestT };
}

const getPolygonWorldParts = (poly: PolygonCollider): Vector2[][] => {
  return poly.getWorldParts();
};

function pointInPolygon(point: Vector2, vertices: Vector2[]): boolean {
  let inside = false;
  for (let i = 0, previous = vertices.length - 1; i < vertices.length; previous = i++) {
    const currentPoint = vertices[i];
    const previousPoint = vertices[previous];
    if (!currentPoint || !previousPoint) continue;
    if (pointOnSegment(point, previousPoint, currentPoint)) return true;
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < (previousPoint.x - currentPoint.x)
        * (point.y - currentPoint.y)
        / (previousPoint.y - currentPoint.y)
        + currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

const pointOnSegment = (
  point: Vector2,
  start: Vector2,
  end: Vector2,
): boolean => {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const pointX = point.x - start.x;
  const pointY = point.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  // A repeated closing vertex is a point, not a segment spanning the plane.
  // Keep its boundary semantics exact: only that same vertex is contained.
  if (lengthSquared === 0) {
    return point.x === start.x && point.y === start.y;
  }
  const cross = segmentX * pointY - segmentY * pointX;
  const scale = Math.max(
    1,
    Math.abs(segmentX * pointY),
    Math.abs(segmentY * pointX),
  );
  if (Math.abs(cross) > Number.EPSILON * scale * 16) return false;

  const dot = pointX * segmentX + pointY * segmentY;
  const tolerance = Number.EPSILON * Math.max(1, lengthSquared) * 16;
  return dot >= -tolerance && dot <= lengthSquared + tolerance;
};

function raycastExpandedPolygon(
  polygon: PolygonCollider,
  origin: Vector2,
  dir: Vector2,
  maxDistance: number,
  radius: number,
): RaycastHit | null {
  const entity = polygon.getEntity();
  const parts = getPolygonWorldParts(polygon);
  if (parts.some((part) => pointInPolygon(origin, part))) {
    return overlapHit(entity, origin, dir);
  }
  const hits: Array<RaycastHit | null> = [];
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      const start = part[index];
      const end = part[(index + 1) % part.length];
      if (!start || !end) continue;
      hits.push(raycastSegmentCapsule(
        entity,
        start,
        end,
        radius,
        origin,
        dir,
        maxDistance,
      ));
    }
  }
  return nearestHit(hits);
}

function segmentRayIntersection(a: Vector2, b: Vector2, r0: Vector2, r1: Vector2): { point: Vector2; distance: number } | null {
  const v1 = r0.sub(a);
  const v2 = b.sub(a);
  const v3 = new Vector2(-(r1.y - r0.y), r1.x - r0.x);
  const denom = v2.dot(v3);
  if (Math.abs(denom) < 1e-9) return null; // parallel
  const t1 = v2.cross(v1) / denom;
  const t2 = v1.dot(v3) / denom;
  if (t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1) {
    const hitPoint = new Vector2(r0.x + (r1.x - r0.x) * t1, r0.y + (r1.y - r0.y) * t1);
    const dist = hitPoint.sub(r0).length();
    return { point: hitPoint, distance: dist };
  }
  return null;
}
