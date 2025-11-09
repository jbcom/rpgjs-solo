import { AABB } from '../core/math/AABB';
import { Vector2 } from '../core/math/Vector2';
import { Entity } from '../physics/Entity';
import { Collider, CollisionInfo, ContactPoint } from './Collider';
import { AABBCollider } from './AABBCollider';
import { CircleCollider } from './CircleCollider';

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


