import { Vector2 } from '../core/math/Vector2';
import { AABB } from '../core/math/AABB';
import { Collider } from './Collider';
import { AABBCollider } from './AABBCollider';
import { CircleCollider } from './CircleCollider';
import { PolygonCollider } from './PolygonCollider';
import { createCollider } from './detector';
import { Entity } from '../physics/Entity';

export interface SweepResult {
  time: number; // 0..1 within the step
  normal: Vector2;
  point: Vector2;
}

/**
 * Computes time-of-impact for a pair of entities using simple analytical sweeps.
 * Supports Circle-Circle, Circle-AABB, AABB-AABB. Polygon falls back to AABB sweep.
 *
 * @param a - First entity
 * @param b - Second entity
 * @param delta - World displacement of entity A over the step (A's motion, B assumed static). For relative motion, pass (vA - vB) * dt.
 * @returns SweepResult or null if no hit in [0,1]
 *
 * @example
 * ```typescript
 * const rel = entityA.velocity.sub(entityB.velocity).mul(dt);
 * const hit = sweepEntities(entityA, entityB, rel);
 * ```
 */
export function sweepEntities(a: Entity, b: Entity, delta: Vector2): SweepResult | null {
  const ca = createCollider(a);
  const cb = createCollider(b);
  if (!ca || !cb) return null;
  return sweepColliders(ca, cb, delta);
}

export function sweepColliders(a: Collider, b: Collider, delta: Vector2): SweepResult | null {
  if (a instanceof CircleCollider && b instanceof CircleCollider) {
    return sweepCircleCircle(a, b, delta);
  }
  if (a instanceof CircleCollider && b instanceof AABBCollider) {
    return sweepCircleAABB(a, b, delta);
  }
  if (a instanceof AABBCollider && b instanceof CircleCollider) {
    const res = sweepCircleAABB(b, a, delta.mul(-1));
    if (!res) return null;
    return { time: res.time, normal: res.normal.mul(-1), point: res.point };
  }
  if (a instanceof AABBCollider && b instanceof AABBCollider) {
    return sweepAABBAABB(a, b, delta);
  }
  // Fallback for polygons: use their AABBs
  if (a instanceof PolygonCollider || b instanceof PolygonCollider) {
    const aa = a.getBounds();
    const bb = b.getBounds();
    const ca = new AABBCollider(a.getEntity());
    const cb = new AABBCollider(b.getEntity());
    // Temporarily monkey-patch to use bounds of polygons
    (ca as any).getBounds = () => aa;
    (cb as any).getBounds = () => bb;
    return sweepAABBAABB(ca, cb, delta);
  }
  return null;
}

function sweepCircleCircle(a: CircleCollider, b: CircleCollider, delta: Vector2): SweepResult | null {
  // Relative motion: move A by delta, B static
  const p0 = a.getCenter();
  const c = b.getCenter();
  const r = a.getRadius() + b.getRadius();
  const m = p0.sub(c);
  const d = delta;
  const A = d.dot(d);
  const B = 2 * m.dot(d);
  const C = m.dot(m) - r * r;
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A === 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (t < 0 || t > 1) return null;
  const hitPoint = p0.add(d.mul(t));
  const normal = hitPoint.sub(c).normalize();
  return { time: t, normal, point: hitPoint.sub(normal.mul(a.getRadius())) };
}

function sweepCircleAABB(circle: CircleCollider, box: AABBCollider, delta: Vector2): SweepResult | null {
  // Expand AABB by circle radius, then raycast circle center against it
  const r = circle.getRadius();
  const b = box.getBounds();
  const expanded = new AABB(b.minX - r, b.minY - r, b.maxX + r, b.maxY + r);
  const p0 = circle.getCenter();

  // Ray vs expanded AABB
  const dir = delta;
  const maxDist = 1; // parameterize within [0,1]
  const origin = new Vector2(0, 0);
  // Transform so p0 -> origin, box relative
  const bb = new AABB(expanded.minX - p0.x, expanded.minY - p0.y, expanded.maxX - p0.x, expanded.maxY - p0.y);
  const res = rayVsAABB(origin, dir, bb, maxDist);
  if (!res) return null;
  const t = res.t;
  const hitPos = p0.add(dir.mul(t));
  const normal = res.normal;
  return { time: t, normal, point: hitPos.sub(normal.mul(r)) };
}

function sweepAABBAABB(a: AABBCollider, b: AABBCollider, delta: Vector2): SweepResult | null {
  // Compute times of entry/exit along each axis using swept AABB
  const A = a.getBounds();
  const B = b.getBounds();
  const invDx = 1 / (delta.x === 0 ? 1e-9 : delta.x);
  const invDy = 1 / (delta.y === 0 ? 1e-9 : delta.y);

  const xEntry = ((delta.x > 0 ? B.minX - A.maxX : B.maxX - A.minX) * invDx);
  const xExit  = ((delta.x > 0 ? B.maxX - A.minX : B.minX - A.maxX) * invDx);
  const yEntry = ((delta.y > 0 ? B.minY - A.maxY : B.maxY - A.minY) * invDy);
  const yExit  = ((delta.y > 0 ? B.maxY - A.minY : B.minY - A.maxY) * invDy);

  const tEntry = Math.max(Math.min(xEntry, xExit), Math.min(yEntry, yExit));
  const tExit  = Math.min(Math.max(xEntry, xExit), Math.max(yEntry, yExit));

  if (tEntry > tExit || tEntry < 0 || tEntry > 1) return null;

  let normal: Vector2;
  if (Math.min(xEntry, xExit) > Math.min(yEntry, yExit)) {
    normal = new Vector2(delta.x > 0 ? -1 : 1, 0);
  } else {
    normal = new Vector2(0, delta.y > 0 ? -1 : 1);
  }

  const hitPoint = new Vector2(
    delta.x !== 0 ? (delta.x > 0 ? A.maxX : A.minX) : (A.minX + A.maxX) * 0.5,
    delta.y !== 0 ? (delta.y > 0 ? A.maxY : A.minY) : (A.minY + A.maxY) * 0.5,
  );

  return { time: tEntry, normal, point: hitPoint };
}

function rayVsAABB(origin: Vector2, dir: Vector2, b: AABB, maxT: number): { t: number; normal: Vector2 } | null {
  const invDx = 1 / (dir.x === 0 ? 1e-9 : dir.x);
  const invDy = 1 / (dir.y === 0 ? 1e-9 : dir.y);
  let tmin = 0;
  let tmax = maxT;

  const tx1 = (b.minX - origin.x) * invDx;
  const tx2 = (b.maxX - origin.x) * invDx;
  const ty1 = (b.minY - origin.y) * invDy;
  const ty2 = (b.maxY - origin.y) * invDy;

  const tminX = Math.min(tx1, tx2);
  const tmaxX = Math.max(tx1, tx2);
  const tminY = Math.min(ty1, ty2);
  const tmaxY = Math.max(ty1, ty2);

  tmin = Math.max(tmin, Math.max(tminX, tminY));
  tmax = Math.min(tmax, Math.min(tmaxX, tmaxY));

  if (tmax < tmin || tmin < 0 || tmin > maxT) return null;
  const normal = (tmin === tminX) ? new Vector2(dir.x > 0 ? -1 : 1, 0) : new Vector2(0, dir.y > 0 ? -1 : 1);
  return { t: tmin, normal };
}


