import { AABB } from '../core/math/AABB';
import { Entity } from '../physics/Entity';
import { SpatialPartition } from '../world/SpatialPartition';
import { createCollider } from './detector';
import { Ray, RaycastHit } from './Ray';
import { raycastCollider } from './raycast';

interface BVHLeaf {
  entity: Entity;
  bounds: AABB;
}

class BVHNode {
  bounds: AABB;
  left: BVHNode | null = null;
  right: BVHNode | null = null;
  leaf: BVHLeaf | null = null;
  constructor(bounds: AABB) {
    this.bounds = bounds;
  }
}

/**
 * Simple BVH spatial partition (rebuild-on-update)
 *
 * Not a dynamic tree; we rebuild the entire hierarchy when entities change.
 * Suitable for medium sized scenes; keeps API parity with `SpatialPartition`.
 */
export class BVH implements SpatialPartition {
  private entities: Map<Entity, BVHLeaf> = new Map();
  private root: BVHNode | null = null;

  public clear(): void {
    this.entities.clear();
    this.root = null;
  }

  public insert(entity: Entity): void {
    const collider = createCollider(entity);
    if (!collider) return;
    const leaf: BVHLeaf = { entity, bounds: collider.getBounds() };
    this.entities.set(entity, leaf);
    this.rebuild();
  }

  public remove(entity: Entity): void {
    this.entities.delete(entity);
    this.rebuild();
  }

  public update(entity: Entity): void {
    const leaf = this.entities.get(entity);
    const collider = createCollider(entity);
    if (!collider) return;
    const b = collider.getBounds();
    if (!leaf || !equalAABB(leaf.bounds, b)) {
      this.entities.set(entity, { entity, bounds: b });
      this.rebuild();
    }
  }

  public query(entity: Entity): Set<Entity> {
    const collider = createCollider(entity);
    if (!collider) return new Set();
    const bounds = collider.getBounds();
    const out = new Set<Entity>();
    this.queryAABBInternal(bounds, out);
    out.delete(entity);
    return out;
  }

  public queryAABB(bounds: AABB): Set<Entity> {
    const out = new Set<Entity>();
    this.queryAABBInternal(bounds, out);
    return out;
  }

  public raycast(ray: Ray, mask?: number, filter?: (entity: Entity) => boolean): RaycastHit | null {
    // Query AABB that encompasses the ray
    const origin = ray.origin;
    const end = ray.getPoint(ray.length);
    const bounds = new AABB(
      Math.min(origin.x, end.x),
      Math.min(origin.y, end.y),
      Math.max(origin.x, end.x),
      Math.max(origin.y, end.y),
    );

    const candidates = this.queryAABB(bounds);
    let closestHit: RaycastHit | null = null;

    for (const entity of candidates) {
      // Check mask if provided
      if (mask !== undefined && (entity.collisionCategory & mask) === 0) continue;

      // Check filter if provided
      if (filter && !filter(entity)) continue;

      const collider = createCollider(entity);
      if (collider) {
        const hit = raycastCollider(collider, ray.origin, ray.direction, ray.length);
        if (hit) {
          if (!closestHit || hit.distance < closestHit.distance) {
            closestHit = hit;
          }
        }
      }
    }

    return closestHit;
  }

  private queryAABBInternal(bounds: AABB, out: Set<Entity>): void {
    if (!this.root) return;
    const stack: BVHNode[] = [this.root];
    while (stack.length) {
      const n = stack.pop()!;
      if (!n.bounds.intersects(bounds)) continue;
      if (n.leaf) {
        if (n.leaf.bounds.intersects(bounds)) out.add(n.leaf.entity);
      } else {
        if (n.left) stack.push(n.left);
        if (n.right) stack.push(n.right);
      }
    }
  }

  private rebuild(): void {
    const leaves = Array.from(this.entities.values());
    this.root = buildBVH(leaves);
  }
}

function buildBVH(leaves: BVHLeaf[]): BVHNode | null {
  if (leaves.length === 0) return null;
  if (leaves.length === 1) {
    const leaf = leaves[0];
    if (!leaf) return null;
    const n = new BVHNode(leaf.bounds);
    n.leaf = leaf;
    return n;
  }
  // Split along largest axis at median
  const firstLeaf = leaves[0];
  if (!firstLeaf) return null;
  const bounds = leaves.slice(1).reduce((acc, l) => {
    if (!l) return acc;
    return acc.union(l.bounds);
  }, firstLeaf.bounds);
  const extentX = bounds.maxX - bounds.minX;
  const extentY = bounds.maxY - bounds.minY;
  const axis = extentX >= extentY ? 0 : 1;
  leaves.sort((a, b) => {
    if (!a || !b) return 0;
    return centerOf(a.bounds, axis) - centerOf(b.bounds, axis);
  });
  const mid = Math.floor(leaves.length / 2);
  const left = buildBVH(leaves.slice(0, mid));
  const right = buildBVH(leaves.slice(mid));
  if (!left || !right) return null;
  const n = new BVHNode(left.bounds.union(right.bounds));
  n.left = left;
  n.right = right;
  return n;
}

function centerOf(b: AABB, axis: number): number {
  return axis === 0 ? (b.minX + b.maxX) * 0.5 : (b.minY + b.maxY) * 0.5;
}

function equalAABB(a: AABB, b: AABB): boolean {
  return a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;
}


