import { Entity } from '../physics/Entity';
import { AABB } from '../core/math/AABB';
import { createCollider } from './detector';

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
}

