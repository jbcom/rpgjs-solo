import { AABB } from '../core/math/AABB';
import { Vector2 } from '../core/math/Vector2';
import { Entity } from '../physics/Entity';
import { Collider, CollisionInfo, ContactPoint } from './Collider';
import { AABBCollider } from './AABBCollider';
import { CircleCollider } from './CircleCollider';
import { Ray, RaycastHit } from './Ray';

/**
 * Configuration for polygon colliders
 */
export interface PolygonConfig {
  /** Vertices for a single convex polygon (local space) */
  vertices?: Vector2[];
  /** If true, `vertices` are guaranteed convex and counter-clockwise */
  isConvex?: boolean;
  /**
   * Convex parts for concave shapes (list of convex polygons, local space)
   * If provided, `vertices` is ignored.
   */
  parts?: Vector2[][];
}

/**
 * Weak registry to attach polygon configurations to entities
 */
export const entityToPolygonConfig: WeakMap<Entity, PolygonConfig> = new WeakMap();

/**
 * Assigns a polygon collider configuration to an existing entity.
 * The entity will use this collider when `createCollider` is invoked.
 *
 * @param entity - Target entity
 * @param config - Polygon configuration
 * @example
 * ```typescript
 * const e = new Entity({ position: { x: 0, y: 0 } });
 * assignPolygonCollider(e, { vertices: [new Vector2(-1, -1), new Vector2(1, -1), new Vector2(1, 1), new Vector2(-1, 1)], isConvex: true });
 * ```
 */
export function assignPolygonCollider(entity: Entity, config: PolygonConfig): void {
  entityToPolygonConfig.set(entity, config);
}

/**
 * Polygon collider implementation (convex via SAT; concave via convex parts)
 *
 * Design notes (in English):
 * - Vertices are defined in local space (centered on entity.position) and rotated by entity.rotation at query time.
 * - Concave shapes are supported by providing pre-decomposed convex `parts`. The collider iterates pairs of convex parts.
 * - Narrow-phase uses SAT (Separating Axis Theorem) on all candidate axes from both polygons.
 * - Contact point is approximated from the overlap normal and polygon centroid for performance and stability.
 *
 * @example
 * ```typescript
 * const e = new Entity({ position: { x: 0, y: 0 } });
 * assignPolygonCollider(e, { vertices: [new Vector2(0, 0), new Vector2(2, 0), new Vector2(1, 2)], isConvex: true });
 * const collider = new PolygonCollider(e);
 * ```
 */
export class PolygonCollider implements Collider {
  private entity: Entity;
  private convexParts: Vector2[][]; // local-space convex polygons

  constructor(entity: Entity) {
    this.entity = entity;
    const cfg = entityToPolygonConfig.get(entity);
    if (!cfg) {
      this.convexParts = [];
      return;
    }
    if (cfg.parts && cfg.parts.length > 0) {
      this.convexParts = cfg.parts.map((p) => p.slice());
    } else if (cfg.vertices && cfg.vertices.length >= 3) {
      this.convexParts = [cfg.vertices.slice()];
    } else {
      this.convexParts = [];
    }
  }

  public getEntity(): Entity {
    return this.entity;
  }

  public getBounds(): AABB {
    const rotation = this.entity.rotation;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const part of this.convexParts) {
      for (const v of part) {
        const x = v.x * cos - v.y * sin + this.entity.position.x;
        const y = v.x * sin + v.y * cos + this.entity.position.y;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (minX === Number.POSITIVE_INFINITY) {
      // Empty polygon: return a zero-sized AABB at entity position
      minX = maxX = this.entity.position.x;
      minY = maxY = this.entity.position.y;
    }

    return new AABB(minX, minY, maxX, maxY);
  }

  public getContactPoints(other: Collider): ContactPoint[] {
    const info = this.testCollision(other);
    return info ? info.contacts : [];
  }

  public testCollision(other: Collider): CollisionInfo | null {
    if (other instanceof CircleCollider) {
      return this.testPolygonCircle(other);
    }
    if (other instanceof AABBCollider) {
      return this.testPolygonAABB(other);
    }
    if (other instanceof PolygonCollider) {
      return this.testPolygonPolygon(other);
    }
    return null;
  }

  private testPolygonAABB(other: AABBCollider): CollisionInfo | null {
    // Convert AABB to a convex polygon and reuse polygon-polygon SAT
    const b = other.getBounds();
    const halfW = (b.maxX - b.minX) / 2;
    const halfH = (b.maxY - b.minY) / 2;
    const center = new Vector2((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    const aabbPolyLocal = [
      new Vector2(-halfW, -halfH),
      new Vector2(halfW, -halfH),
      new Vector2(halfW, halfH),
      new Vector2(-halfW, halfH),
    ];
    const tempEntity = new Entity({ position: center, rotation: 0, mass: 0 });
    entityToPolygonConfig.set(tempEntity, { vertices: aabbPolyLocal, isConvex: true });
    const tempPoly = new PolygonCollider(tempEntity);
    const result = this.testPolygonPolygon(tempPoly);
    if (!result) return null;
    // Remap entityB to actual AABB's entity
    return {
      entityA: result.entityA === tempEntity ? this.entity : result.entityA,
      entityB: other.getEntity(),
      contacts: result.contacts,
      normal: result.normal,
      depth: result.depth,
    };
  }

  private testPolygonCircle(other: CircleCollider): CollisionInfo | null {
    // For each convex part, find closest distance from circle center to polygon edges
    let bestInfo: CollisionInfo | null = null;
    const center = other.getCenter();
    const r = other.getRadius();

    for (const part of this.getWorldParts()) {
      // Find the closest point on polygon to the circle center
      let minDistSq = Number.POSITIVE_INFINITY;
      let closestPoint: Vector2 | null = null;

      for (let i = 0; i < part.length; i++) {
        const a = part[i];
        const b = part[(i + 1) % part.length];
        if (!a || !b) continue;
        const cp = closestPointOnSegment(a, b, center);
        const dsq = center.distanceToSquared(cp);
        if (dsq < minDistSq) {
          minDistSq = dsq;
          closestPoint = cp;
        }
      }

      if (!closestPoint) continue;
      const dist = Math.sqrt(minDistSq);
      if (dist <= r) {
        const normal = dist > 1e-6 ? center.sub(closestPoint).normalize() : new Vector2(1, 0);
        const depth = r - dist;
        const info: CollisionInfo = {
          entityA: this.entity,
          entityB: other.getEntity(),
          contacts: [{ point: closestPoint, normal, depth }],
          normal,
          depth,
        };
        // Return the deepest collision among parts
        if (!bestInfo || info.depth > bestInfo.depth) bestInfo = info;
      }
    }

    return bestInfo;
  }

  private testPolygonPolygon(other: PolygonCollider): CollisionInfo | null {
    let bestDepth = Number.POSITIVE_INFINITY;
    let bestAxis: Vector2 | null = null;
    let flipNormal = false;

    // Test all pairs of convex parts
    const partsA = this.getWorldParts();
    const partsB = other.getWorldParts();

    let collided = false;
    for (const a of partsA) {
      for (const b of partsB) {
        const axes = gatherSATAxes(a, b);
        let overlapDepth = Number.POSITIVE_INFINITY;
        let axisForPair: Vector2 | null = null;
        for (const axis of axes) {
          const projA = projectOntoAxis(a, axis);
          const projB = projectOntoAxis(b, axis);
          const overlap = intervalOverlap(projA.min, projA.max, projB.min, projB.max);
          if (overlap <= 0) {
            // Separating axis found: no collision for this pair
            overlapDepth = -1;
            break;
          }
          if (overlap < overlapDepth) {
            overlapDepth = overlap;
            axisForPair = axis;
          }
        }
        if (overlapDepth > 0 && axisForPair) {
          collided = true;
          if (overlapDepth < bestDepth) {
            bestDepth = overlapDepth;
            bestAxis = axisForPair;
            // Heuristic: direction from centroidA to centroidB
            const cA = polygonCentroid(a);
            const cB = polygonCentroid(b);
            flipNormal = cA.sub(cB).dot(bestAxis) > 0; // if axis points from B->A, flip
          }
        }
      }
    }

    if (!collided || !bestAxis) return null;

    const normal = flipNormal ? bestAxis.mul(-1) : bestAxis.clone();
    const depth = bestDepth;

    // Approximate a contact point at the surface of A along the collision normal
    const centroidA = polygonCentroid(partsA[0]!);
    const contactPoint = centroidA.add(normal.mul(0.0));

    return {
      entityA: this.entity,
      entityB: other.getEntity(),
      contacts: [{ point: contactPoint, normal, depth }],
      normal,
      depth,
    };
  }

  /**
   * @inheritdoc
   */
  public raycast(ray: Ray): RaycastHit | null {
    // 1. Broad phase: check AABB
    const bounds = this.getBounds();
    // Simple AABB check (can reuse AABB logic or just check if ray intersects AABB)
    // We can create a temp AABB collider or just do the math.
    // Let's do a quick check.
    const tMin = (bounds.minX - ray.origin.x) / ray.direction.x;
    const tMax = (bounds.maxX - ray.origin.x) / ray.direction.x;
    const tymin = (bounds.minY - ray.origin.y) / ray.direction.y;
    const tymax = (bounds.maxY - ray.origin.y) / ray.direction.y;

    const t1 = Math.min(tMin, tMax);
    const t2 = Math.max(tMin, tMax);
    const t3 = Math.min(tymin, tymax);
    const t4 = Math.max(tymin, tymax);

    const tNear = Math.max(t1, t3);
    const tFar = Math.min(t2, t4);

    if (tNear > tFar || tFar < 0) return null;
    if (tNear > ray.length) return null;

    let closestHit: RaycastHit | null = null;

    // 2. Check all convex parts
    const parts = this.getWorldParts();
    for (const part of parts) {
      for (let i = 0; i < part.length; i++) {
        const p1 = part[i];
        const p2 = part[(i + 1) % part.length];

        if (!p1 || !p2) continue;

        const hit = this.rayCastSegment(ray, p1, p2);
        if (hit) {
          if (!closestHit || hit.distance < closestHit.distance) {
            closestHit = hit;
          }
        }
      }
    }

    return closestHit;
  }

  private rayCastSegment(ray: Ray, p1: Vector2, p2: Vector2): RaycastHit | null {
    const v1 = ray.origin;
    const v2 = ray.origin.add(ray.direction);
    const v3 = p1;
    const v4 = p2;

    const den = (v1.x - v2.x) * (v3.y - v4.y) - (v1.y - v2.y) * (v3.x - v4.x);
    if (den === 0) return null;

    const t = ((v1.x - v3.x) * (v3.y - v4.y) - (v1.y - v3.y) * (v3.x - v4.x)) / den;
    const u = -((v1.x - v2.x) * (v1.y - v3.y) - (v1.y - v2.y) * (v1.x - v3.x)) / den;

    if (t >= 0 && t <= ray.length && u >= 0 && u <= 1) {
      const point = new Vector2(
        v1.x + t * (v2.x - v1.x),
        v1.y + t * (v2.y - v1.y)
      );

      // Normal is perpendicular to the segment
      const segmentDir = p2.sub(p1).normalize();
      let normal = new Vector2(-segmentDir.y, segmentDir.x);

      // Ensure normal points against the ray
      if (normal.dot(ray.direction) > 0) {
        normal = normal.mul(-1);
      }

      return {
        entity: this.entity,
        point,
        normal,
        distance: t,
      };
    }
    return null;
  }

  private getWorldParts(): Vector2[][] {
    const rotation = this.entity.rotation;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const px = this.entity.position.x;
    const py = this.entity.position.y;
    const worldParts: Vector2[][] = [];
    for (const part of this.convexParts) {
      const w: Vector2[] = new Array(part.length);
      for (let i = 0; i < part.length; i++) {
        const v = part[i];
        if (!v) continue;
        w[i] = new Vector2(v.x * cos - v.y * sin + px, v.x * sin + v.y * cos + py);
      }
      worldParts.push(w);
    }
    return worldParts;
  }
}

function closestPointOnSegment(a: Vector2, b: Vector2, p: Vector2): Vector2 {
  const ab = b.sub(a);
  const ap = p.sub(a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.dot(ab)));
  return a.add(ab.mul(t));
}

function gatherSATAxes(a: Vector2[], b: Vector2[]): Vector2[] {
  const axes: Vector2[] = [];
  const pushAxis = (p: Vector2[], i: number) => {
    const p0 = p[i];
    const p1 = p[(i + 1) % p.length];
    if (!p0 || !p1) return;
    const edge = p1.sub(p0);
    // Perpendicular (normal)
    const axis = new Vector2(-edge.y, edge.x).normalize();
    axes.push(axis);
  };
  for (let i = 0; i < a.length; i++) pushAxis(a, i);
  for (let i = 0; i < b.length; i++) pushAxis(b, i);
  return axes;
}

function projectOntoAxis(poly: Vector2[], axis: Vector2): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of poly) {
    const p = v.dot(axis);
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return { min, max };
}

function intervalOverlap(minA: number, maxA: number, minB: number, maxB: number): number {
  return Math.min(maxA, maxB) - Math.max(minA, minB);
}

function polygonCentroid(poly: Vector2[]): Vector2 {
  let cx = 0;
  let cy = 0;
  for (const v of poly) {
    cx += v.x;
    cy += v.y;
  }
  const n = poly.length > 0 ? poly.length : 1;
  return new Vector2(cx / n, cy / n);
}


