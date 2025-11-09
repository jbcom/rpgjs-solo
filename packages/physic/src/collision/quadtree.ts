import { AABB } from '../core/math/AABB';
import { Entity } from '../physics/Entity';
import { SpatialPartition } from '../world/SpatialPartition';
import { createCollider } from './detector';

interface QuadItem {
  entity: Entity;
  bounds: AABB;
}

class QuadNode {
  bounds: AABB;
  items: QuadItem[] = [];
  children: QuadNode[] | null = null;
  constructor(bounds: AABB) {
    this.bounds = bounds;
  }
}

/**
 * Quadtree spatial partition implementation
 *
 * Design: simple PR quadtree with capacity threshold; reinserts on update.
 * This implementation favors predictable performance and minimal allocations.
 *
 * @example
 * ```typescript
 * const qt = new Quadtree(new AABB(-1000,-1000,1000,1000), 8, 6, 8);
 * qt.insert(entity);
 * const near = qt.query(entity);
 * ```
 */
export class Quadtree implements SpatialPartition {
  private root: QuadNode;
  private capacity: number;
  private maxDepth: number;
  private entityMap: Map<Entity, QuadItem> = new Map();

  constructor(worldBounds: AABB, capacity = 8, maxDepth = 8) {
    this.root = new QuadNode(worldBounds);
    this.capacity = capacity;
    this.maxDepth = maxDepth;
  }

  public clear(): void {
    this.root = new QuadNode(this.root.bounds);
    this.entityMap.clear();
  }

  public insert(entity: Entity): void {
    const collider = createCollider(entity);
    if (!collider) return;
    const bounds = collider.getBounds();
    const item: QuadItem = { entity, bounds };
    this.entityMap.set(entity, item);
    this.insertItem(this.root, item, 0);
  }

  public remove(entity: Entity): void {
    // Simplest removal: clear and reinsert all (bounded cost for few entities)
    if (!this.entityMap.has(entity)) return;
    this.entityMap.delete(entity);
    const items = Array.from(this.entityMap.values());
    this.clear();
    for (const it of items) this.insertItem(this.root, it, 0);
  }

  public update(entity: Entity): void {
    const it = this.entityMap.get(entity);
    const collider = createCollider(entity);
    if (!collider) return;
    const newBounds = collider.getBounds();
    if (!it) {
      this.entityMap.set(entity, { entity, bounds: newBounds });
      this.insertItem(this.root, { entity, bounds: newBounds }, 0);
      return;
    }
    // If bounds changed enough, reinsert
    const b = it.bounds;
    if (b.minX !== newBounds.minX || b.minY !== newBounds.minY || b.maxX !== newBounds.maxX || b.maxY !== newBounds.maxY) {
      it.bounds = newBounds;
      // Rebuild lightweight: clear and reinsert (acceptable for moderate N)
      const items = Array.from(this.entityMap.values());
      this.clear();
      for (const item of items) this.insertItem(this.root, item, 0);
    }
  }

  public query(entity: Entity): Set<Entity> {
    const collider = createCollider(entity);
    if (!collider) return new Set();
    const bounds = collider.getBounds();
    const results = new Set<Entity>();
    this.queryBounds(this.root, bounds, results);
    results.delete(entity);
    return results;
  }

  public queryAABB(bounds: AABB): Set<Entity> {
    const results = new Set<Entity>();
    this.queryBounds(this.root, bounds, results);
    return results;
  }

  private insertItem(node: QuadNode, item: QuadItem, depth: number): void {
    if (!node.children && (node.items.length < this.capacity || depth >= this.maxDepth)) {
      node.items.push(item);
      return;
    }
    if (!node.children) this.subdivide(node);
    const child = this.findChild(node, item.bounds);
    if (child) {
      this.insertItem(child, item, depth + 1);
    } else {
      node.items.push(item);
    }
  }

  private queryBounds(node: QuadNode, bounds: AABB, out: Set<Entity>): void {
    if (!node.bounds.intersects(bounds)) return;
    for (const it of node.items) {
      if (it.bounds.intersects(bounds)) out.add(it.entity);
    }
    if (node.children) {
      for (const c of node.children) this.queryBounds(c, bounds, out);
    }
  }

  private subdivide(node: QuadNode): void {
    const b = node.bounds;
    const midX = (b.minX + b.maxX) * 0.5;
    const midY = (b.minY + b.maxY) * 0.5;
    node.children = [
      new QuadNode(new AABB(b.minX, b.minY, midX, midY)), // SW
      new QuadNode(new AABB(midX, b.minY, b.maxX, midY)), // SE
      new QuadNode(new AABB(b.minX, midY, midX, b.maxY)), // NW
      new QuadNode(new AABB(midX, midY, b.maxX, b.maxY)), // NE
    ];
  }

  private findChild(node: QuadNode, bounds: AABB): QuadNode | null {
    if (!node.children) return null;
    for (const c of node.children) {
      if (containsAABB(c.bounds, bounds)) return c;
    }
    return null;
  }
}

function containsAABB(outer: AABB, inner: AABB): boolean {
  return outer.minX <= inner.minX && outer.maxX >= inner.maxX && outer.minY <= inner.minY && outer.maxY >= inner.maxY;
}


