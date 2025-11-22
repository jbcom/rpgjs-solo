import { Entity } from '../physics/Entity';
import { AABB } from '../core/math/AABB';
import { createCollider } from './detector';
import { Ray, RaycastHit } from './Ray';

/**
 * Spatial hash cell containing entities
 */
class SpatialHashCell {
  // Array is generally faster for iteration than Set for small numbers of items
  public entities: Entity[] = [];

  /**
   * Adds an entity to this cell
   * 
   * @param entity - Entity to add
   */
  public add(entity: Entity): void {
    if (this.entities.indexOf(entity) === -1) {
      this.entities.push(entity);
    }
  }

  /**
   * Removes an entity from this cell
   * 
   * @param entity - Entity to remove
   */
  public remove(entity: Entity): void {
    const index = this.entities.indexOf(entity);
    if (index !== -1) {
      // Fast remove: swap with last and pop
      const last = this.entities[this.entities.length - 1];
      if (last) {
        this.entities[index] = last;
      }
      this.entities.pop();
    }
  }

  /**
   * Clears all entities from this cell
   */
  public clear(): void {
    this.entities.length = 0;
  }
}

/**
 * Spatial hash grid for efficient collision detection
 * 
 * Divides the world into a grid of cells and stores entities in cells
 * based on their position. This reduces collision checks from O(n²) to O(n).
 * 
 * @example
 * ```typescript
 * const spatialHash = new SpatialHash(100, 10); // 100x100 cell size, 10x10 grid
 * spatialHash.insert(entity);
 * const nearby = spatialHash.query(entity);
 * ```
 */
export class SpatialHash {
  private cellSize: number;
  private gridWidth: number;
  private gridHeight: number;
  // Use number keys instead of strings to reduce GC pressure
  // Key = (x << 16) | y
  private cells: Map<number, SpatialHashCell>;

  // Cache entity cells to avoid recalculating bounds every frame if not needed
  // Stores the list of cell keys the entity is currently in
  private entityCells: WeakMap<Entity, number[]>;

  /**
   * Creates a new spatial hash
   * 
   * @param cellSize - Size of each cell in world units
   * @param gridWidth - Number of cells horizontally
   * @param gridHeight - Number of cells vertically (default: same as width)
   */
  constructor(cellSize: number, gridWidth: number, gridHeight?: number) {
    this.cellSize = cellSize;
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight ?? gridWidth;
    this.cells = new Map();
    this.entityCells = new WeakMap();
  }

  /**
   * Converts world coordinates to grid coordinates
   * 
   * @param x - World X coordinate
   * @param y - World Y coordinate
   * @returns Grid coordinates
   */
  private worldToGrid(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.floor(x / this.cellSize),
      y: Math.floor(y / this.cellSize),
    };
  }

  /**
   * Creates a cell key from grid coordinates
   * 
   * @param gridX - Grid X coordinate
   * @param gridY - Grid Y coordinate
   * @returns Numeric cell key
   */
  private getKey(gridX: number, gridY: number): number {
    // Simple packing: x in high 16 bits, y in low 16 bits
    // Adjust for negative coordinates by adding offset if needed, 
    // but here we assume positive grid or handle wrapping.
    // For wrapping grid:
    return (gridX & 0xFFFF) << 16 | (gridY & 0xFFFF);
  }

  /**
   * Gets or creates a cell at grid coordinates
   * 
   * @param key - Cell key
   * @returns Cell instance
   */
  private getCell(key: number): SpatialHashCell {
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new SpatialHashCell();
      this.cells.set(key, cell);
    }
    return cell;
  }

  /**
   * Gets all cell keys that an entity's AABB overlaps
   * 
   * @param entity - Entity to get cells for
   * @param outKeys - Array to store keys in (to avoid allocation)
   * @returns Number of keys added
   */
  private getEntityKeys(entity: Entity, outKeys: number[]): number {
    const collider = createCollider(entity);
    if (!collider) {
      return 0;
    }

    const bounds = collider.getBounds();
    const minGrid = this.worldToGrid(bounds.minX, bounds.minY);
    const maxGrid = this.worldToGrid(bounds.maxX, bounds.maxY);

    let count = 0;
    outKeys.length = 0;

    for (let x = minGrid.x; x <= maxGrid.x; x++) {
      for (let y = minGrid.y; y <= maxGrid.y; y++) {
        // Wrap coordinates for infinite grid
        const wrappedX = ((x % this.gridWidth) + this.gridWidth) % this.gridWidth;
        const wrappedY = ((y % this.gridHeight) + this.gridHeight) % this.gridHeight;
        outKeys.push(this.getKey(wrappedX, wrappedY));
        count++;
      }
    }
    return count;
  }

  /**
   * Inserts an entity into the spatial hash
   * 
   * @param entity - Entity to insert
   */
  public insert(entity: Entity): void {
    // Calculate new keys
    const newKeys: number[] = [];
    this.getEntityKeys(entity, newKeys);

    // Store for next time
    this.entityCells.set(entity, newKeys);

    // Add to cells
    for (const key of newKeys) {
      const cell = this.getCell(key);
      cell.add(entity);
    }
  }

  /**
   * Removes an entity from the spatial hash
   * 
   * @param entity - Entity to remove
   */
  public remove(entity: Entity): void {
    const keys = this.entityCells.get(entity);
    if (!keys) {
      return;
    }

    for (const key of keys) {
      const cell = this.cells.get(key);
      if (cell) {
        cell.remove(entity);
      }
    }

    this.entityCells.delete(entity);
  }

  /**
   * Updates an entity's position in the spatial hash
   * 
   * Removes and re-inserts the entity if it moved to different cells.
   * 
   * @param entity - Entity to update
   */
  public update(entity: Entity): void {
    const oldKeys = this.entityCells.get(entity);

    // We need to check if the entity has actually moved enough to change cells
    // Optimization: Check if AABB grid bounds changed?
    // For now, let's just recalculate keys and compare.
    // To avoid allocation, we could use a static/shared array for temp keys?
    // But we need to store the new keys anyway.

    const newKeys: number[] = [];
    this.getEntityKeys(entity, newKeys);

    // Check if keys match
    if (oldKeys && oldKeys.length === newKeys.length) {
      let match = true;
      // Since keys are deterministic and we iterate same way, order should match
      for (let i = 0; i < oldKeys.length; i++) {
        if (oldKeys[i] !== newKeys[i]) {
          match = false;
          break;
        }
      }
      if (match) return;
    }

    // Remove from old cells
    if (oldKeys) {
      for (const key of oldKeys) {
        const cell = this.cells.get(key);
        if (cell) {
          cell.remove(entity);
        }
      }
    }

    // Add to new cells
    this.entityCells.set(entity, newKeys);
    for (const key of newKeys) {
      const cell = this.getCell(key);
      cell.add(entity);
    }
  }

  /**
   * Queries entities near a given entity
   * 
   * @param entity - Entity to query around
   * @param results - Optional Set to store results in (avoids allocation)
   * @returns Set of nearby entities (excluding the query entity)
   */
  public query(entity: Entity, results: Set<Entity> = new Set()): Set<Entity> {
    // Use cached keys if available, otherwise calculate
    let keys = this.entityCells.get(entity);
    if (!keys) {
      keys = [];
      this.getEntityKeys(entity, keys);
    }

    results.clear();

    for (const key of keys) {
      const cell = this.cells.get(key);
      if (cell) {
        const entities = cell.entities;
        // Array iteration is fast
        for (let i = 0; i < entities.length; i++) {
          const other = entities[i];
          if (other && other !== entity) {
            results.add(other);
          }
        }
      }
    }

    return results;
  }

  /**
   * Queries entities in an AABB region
   * 
   * @param bounds - AABB to query
   * @returns Set of entities in the region
   */
  public queryAABB(bounds: AABB): Set<Entity> {
    const minGrid = this.worldToGrid(bounds.minX, bounds.minY);
    const maxGrid = this.worldToGrid(bounds.maxX, bounds.maxY);
    const results = new Set<Entity>();

    for (let x = minGrid.x; x <= maxGrid.x; x++) {
      for (let y = minGrid.y; y <= maxGrid.y; y++) {
        const wrappedX = ((x % this.gridWidth) + this.gridWidth) % this.gridWidth;
        const wrappedY = ((y % this.gridHeight) + this.gridHeight) % this.gridHeight;
        const key = this.getKey(wrappedX, wrappedY);
        const cell = this.cells.get(key);
        if (cell) {
          for (const entity of cell.entities) {
            results.add(entity);
          }
        }
      }
    }

    return results;
  }

  /**
   * Clears all entities from the spatial hash
   */
  public clear(): void {
    this.cells.clear();
    // We can't easily clear the WeakMap, but that's fine, it's weak.
    // If we wanted to clear the values in the WeakMap for existing entities,
    // we would need to track them. But usually clear() is used when resetting the world.
  }

  /**
   * Gets statistics about the spatial hash
   * 
   * @returns Statistics object
   */
  public getStats(): {
    totalCells: number;
    usedCells: number;
    totalEntities: number;
    averageEntitiesPerCell: number;
  } {
    let totalEntities = 0;
    for (const cell of this.cells.values()) {
      totalEntities += cell.entities.length;
    }

    return {
      totalCells: this.gridWidth * this.gridHeight,
      usedCells: this.cells.size,
      totalEntities,
      averageEntitiesPerCell: this.cells.size > 0 ? totalEntities / this.cells.size : 0,
    };
  }

  /**
   * Casts a ray against entities in the spatial hash
   * 
   * @param ray - Ray to cast
   * @param mask - Optional collision mask (layer)
   * @param filter - Optional filter function (return true to include entity)
   * @returns Raycast hit info if hit, null otherwise
   */
  public raycast(ray: Ray, mask?: number, filter?: (entity: Entity) => boolean): RaycastHit | null {
    // DDA Algorithm for grid traversal
    const start = ray.origin;
    const end = ray.getPoint(Math.min(ray.length, 10000)); // Cap length to avoid infinite loops

    // console.log('Raycast start:', start, 'end:', end, 'dir:', ray.direction);

    let x0 = start.x;
    let y0 = start.y;
    const x1 = end.x;
    const y1 = end.y;

    // Grid coordinates
    let gx0 = Math.floor(x0 / this.cellSize);
    let gy0 = Math.floor(y0 / this.cellSize);
    const gx1 = Math.floor(x1 / this.cellSize);
    const gy1 = Math.floor(y1 / this.cellSize);

    // const dx = Math.abs(x1 - x0);
    // const dy = Math.abs(y1 - y0);

    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;

    const visitedEntities = new Set<Entity>();
    let closestHit: RaycastHit | null = null;

    // Helper to check cell
    const checkCell = (gx: number, gy: number) => {
      // Wrap coordinates
      const wrappedX = ((gx % this.gridWidth) + this.gridWidth) % this.gridWidth;
      const wrappedY = ((gy % this.gridHeight) + this.gridHeight) % this.gridHeight;
      const key = this.getKey(wrappedX, wrappedY);
      const cell = this.cells.get(key);

      if (cell) {
        // console.log('Checking cell:', gx, gy, 'Entities:', cell.entities.length);
        for (const entity of cell.entities) {
          if (visitedEntities.has(entity)) continue;
          visitedEntities.add(entity);

          // Check mask if provided
          if (mask !== undefined && (entity.collisionCategory & mask) === 0) continue;

          // Check filter if provided
          if (filter && !filter(entity)) {
            continue;
          }

          const collider = createCollider(entity);
          if (collider) {
            const hit = collider.raycast(ray);
            if (hit) {
              if (!closestHit || hit.distance < closestHit.distance) {
                closestHit = hit;
              }
            }
          }
        }
      } else {
      }
    };

    // Bresenham's line algorithm for grid traversal (simplified DDA)
    // Note: Bresenham is for lines, but here we want to visit all cells touched by the ray.
    // A proper DDA (Amanatides & Woo) is better for ray casting.

    // Let's use Amanatides & Woo DDA
    let x = gx0;
    let y = gy0;

    const stepX = sx;
    const stepY = sy;

    const tDeltaX = this.cellSize / Math.abs(ray.direction.x);
    const tDeltaY = this.cellSize / Math.abs(ray.direction.y);

    let tMaxX = (ray.direction.x > 0)
      ? ((x + 1) * this.cellSize - start.x) / ray.direction.x
      : (start.x - x * this.cellSize) / -ray.direction.x; // Handle negative direction carefully

    // Fix for negative direction:
    // If dir.x < 0, we want distance to left edge of cell.
    // Left edge is x * cellSize.
    // Distance is (start.x - x * cellSize) / -dir.x
    // Wait, if x is grid index, left edge is x * cellSize.
    // If we are at x, and moving left, the next boundary is x * cellSize.
    if (ray.direction.x < 0) {
      tMaxX = (start.x - x * this.cellSize) / -ray.direction.x;
    } else {
      tMaxX = ((x + 1) * this.cellSize - start.x) / ray.direction.x;
    }

    let tMaxY = (ray.direction.y > 0)
      ? ((y + 1) * this.cellSize - start.y) / ray.direction.y
      : (start.y - y * this.cellSize) / -ray.direction.y;

    if (ray.direction.y < 0) {
      tMaxY = (start.y - y * this.cellSize) / -ray.direction.y;
    } else {
      tMaxY = ((y + 1) * this.cellSize - start.y) / ray.direction.y;
    }

    // Handle division by zero (axis aligned rays)
    if (Math.abs(ray.direction.x) < 1e-9) {
      tMaxX = Infinity;
    }
    if (Math.abs(ray.direction.y) < 1e-9) {
      tMaxY = Infinity;
    }

    // Max steps to prevent infinite loop
    let steps = 0;
    const maxSteps = Math.abs(gx1 - gx0) + Math.abs(gy1 - gy0) + 10;

    while (steps < maxSteps) {
      checkCell(x, y);

      // If we found a hit that is closer than the distance to the next cell, we can potentially stop.
      // However, an entity in the current cell might have a hit point further away than the next cell boundary 
      // (e.g. a large entity overlapping multiple cells).
      // But if closestHit.distance < tMaxX and closestHit.distance < tMaxY, then the hit is within the current cell (roughly).
      // To be safe, we should probably continue a bit or just check all cells.
      // Optimization: if closestHit.distance < min(tMaxX, tMaxY), we can stop?
      // tMaxX is distance to next X boundary.
      // If hit is before that, it's in this cell (or previous).

      if (closestHit) {
        if ((closestHit as RaycastHit).distance < Math.min(tMaxX, tMaxY)) {
          // We found a hit in this cell (or previous) that is closer than the next cell boundary.
          // We can stop.
          return closestHit;
        }
      }

      if (tMaxX < tMaxY) {
        tMaxX += tDeltaX;
        x += stepX;
      } else {
        tMaxY += tDeltaY;
        y += stepY;
      }
      steps++;

      // Check if we passed the end point
      // Simple check: if we passed the target grid coordinates
      // But with wrapping, this is tricky.
      // Just rely on maxSteps or distance check.
      if (closestHit && (closestHit as RaycastHit).distance < ray.length) {
        // If we have a hit, and we've gone far enough...
      }
    }

    return closestHit;
  }
}

