import { Vector2 } from '../core/math/Vector2';
import { AABB } from '../core/math/AABB';
import { SpatialPartition } from '../world/SpatialPartition';
import { Collider } from './Collider';
import { AABBCollider } from './AABBCollider';
import { CircleCollider } from './CircleCollider';
import { PolygonCollider } from './PolygonCollider';
import { createCollider } from './detector';

export interface RaycastHit {
  entity: ReturnType<Collider['getEntity']>;
  point: Vector2;
  normal: Vector2;
  distance: number;
}

/**
 * Casts a ray in the world using the spatial partition for broad-phase, then shape-specific narrow-phase.
 * Direction will be normalized internally.
 *
 * @param partition - Spatial partition to query
 * @param origin - Ray origin
 * @param direction - Ray direction (any length)
 * @param maxDistance - Maximum distance
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
export function raycast(partition: SpatialPartition, origin: Vector2, direction: Vector2, maxDistance: number): RaycastHit | null {
  const dir = direction.length() > 0 ? direction.normalize() : new Vector2(1, 0);
  const end = origin.add(dir.mul(maxDistance));
  const bounds = new AABB(
    Math.min(origin.x, end.x),
    Math.min(origin.y, end.y),
    Math.max(origin.x, end.x),
    Math.max(origin.y, end.y)
  );

  const candidates = partition.queryAABB(bounds);
  let best: RaycastHit | null = null;

  for (const e of candidates) {
    const collider = createCollider(e);
    if (!collider) continue;
    const hit = raycastCollider(collider, origin, dir, maxDistance);
    if (!hit) continue;
    if (!best || hit.distance < best.distance) best = hit;
  }

  return best;
}

export function raycastCollider(collider: Collider, origin: Vector2, dir: Vector2, maxDistance: number): RaycastHit | null {
  if (collider instanceof CircleCollider) return raycastCircle(collider, origin, dir, maxDistance);
  if (collider instanceof AABBCollider) return raycastAABB(collider, origin, dir, maxDistance);
  if (collider instanceof PolygonCollider) return raycastPolygon(collider, origin, dir, maxDistance);
  return null;
}

function raycastCircle(circle: CircleCollider, origin: Vector2, dir: Vector2, maxDistance: number): RaycastHit | null {
  const c = circle.getCenter();
  const r = circle.getRadius();
  const m = origin.sub(c);
  const b = m.dot(dir);
  const cval = m.dot(m) - r * r;
  if (cval > 0 && b > 0) return null; // ray origin outside and pointing away
  const discr = b * b - cval;
  if (discr < 0) return null;
  const t = -b - Math.sqrt(discr);
  if (t < 0) return null;
  if (t > maxDistance) return null;
  const point = origin.add(dir.mul(t));
  const normal = point.sub(c).normalize();
  return { entity: circle.getEntity(), point, normal, distance: t };
}

function raycastAABB(box: AABBCollider, origin: Vector2, dir: Vector2, maxDistance: number): RaycastHit | null {
  const b = box.getBounds();
  let tmin = 0;
  let tmax = maxDistance;

  const invDx = 1 / (dir.x === 0 ? 1e-9 : dir.x);
  const invDy = 1 / (dir.y === 0 ? 1e-9 : dir.y);

  let tx1 = (b.minX - origin.x) * invDx;
  let tx2 = (b.maxX - origin.x) * invDx;
  let ty1 = (b.minY - origin.y) * invDy;
  let ty2 = (b.maxY - origin.y) * invDy;

  const tminX = Math.min(tx1, tx2);
  const tmaxX = Math.max(tx1, tx2);
  const tminY = Math.min(ty1, ty2);
  const tmaxY = Math.max(ty1, ty2);

  tmin = Math.max(tmin, Math.max(tminX, tminY));
  tmax = Math.min(tmax, Math.min(tmaxX, tmaxY));

  if (tmax < tmin || tmin < 0 || tmin > maxDistance) return null;

  const point = origin.add(dir.mul(tmin));
  // Determine normal based on which slab was hit
  let normal: Vector2;
  if (tmin === tminX) normal = new Vector2(dir.x > 0 ? -1 : 1, 0);
  else normal = new Vector2(0, dir.y > 0 ? -1 : 1);
  return { entity: box.getEntity(), point, normal, distance: tmin };
}

function raycastPolygon(poly: PolygonCollider, origin: Vector2, dir: Vector2, maxDistance: number): RaycastHit | null {
  // Cast ray against all edges; take nearest positive distance
  // We approximate normal as the edge normal pointing outward
  const end = origin.add(dir.mul(maxDistance));
  let bestT = Number.POSITIVE_INFINITY;
  let bestPoint: Vector2 | null = null;
  let bestNormal: Vector2 | null = null;

  // Access world vertices via getBounds + transform approximation would be inefficient; use internal helper via casting
  const any: any = poly as any;
  const parts: Vector2[][] = any['getWorldParts'] ? any['getWorldParts']() : [];
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


