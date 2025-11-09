import { Entity } from '../physics/Entity';
import { AABB } from '../core/math/AABB';
import { createCollider } from './detector';

/**
 * Spatial hash cell containing entities
 */
class SpatialHashCell {
  public entities: Set<Entity> = new Set();

  /**
   * Adds an entity to this cell
   * 
   * @param entity - Entity to add
   */
  public add(entity: Entity): void {
    this.entities.add(entity);
  }

  /**
   * Removes an entity from this cell
   * 
   * @param entity - Entity to remove
   */
  public remove(entity: Entity): void {
    this.entities.delete(entity);
  }

  /**
   * Clears all entities from this cell
   */
  public clear(): void {
    this.entities.clear();
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
  private cells: Map<string, SpatialHashCell>;
  private entityCells: Map<Entity, Set<string>>;

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
    this.entityCells = new Map();
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
   * @returns Cell key string
   */
  private getCellKey(gridX: number, gridY: number): string {
    return `${gridX},${gridY}`;
  }

  /**
   * Gets or creates a cell at grid coordinates
   * 
   * @param gridX - Grid X coordinate
   * @param gridY - Grid Y coordinate
   * @returns Cell instance
   */
  private getCell(gridX: number, gridY: number): SpatialHashCell {
    const key = this.getCellKey(gridX, gridY);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new SpatialHashCell();
      this.cells.set(key, cell);
    }
    return cell;
  }

  /**
   * Gets all cells that an entity's AABB overlaps
   * 
   * @param entity - Entity to get cells for
   * @returns Set of cell keys
   */
  private getEntityCells(entity: Entity): Set<string> {
    const collider = createCollider(entity);
    if (!collider) {
      return new Set();
    }

    const bounds = collider.getBounds();
    const minGrid = this.worldToGrid(bounds.minX, bounds.minY);
    const maxGrid = this.worldToGrid(bounds.maxX, bounds.maxY);

    const cellKeys = new Set<string>();
    for (let x = minGrid.x; x <= maxGrid.x; x++) {
      for (let y = minGrid.y; y <= maxGrid.y; y++) {
        // Wrap coordinates for infinite grid
        const wrappedX = ((x % this.gridWidth) + this.gridWidth) % this.gridWidth;
        const wrappedY = ((y % this.gridHeight) + this.gridHeight) % this.gridHeight;
        cellKeys.add(this.getCellKey(wrappedX, wrappedY));
      }
    }
    return cellKeys;
  }

  /**
   * Inserts an entity into the spatial hash
   * 
   * @param entity - Entity to insert
   */
  public insert(entity: Entity): void {
    // Remove from old cells if already inserted
    this.remove(entity);

    const cellKeys = this.getEntityCells(entity);
    this.entityCells.set(entity, cellKeys);

    for (const key of cellKeys) {
      const cell = this.cells.get(key);
      if (cell) {
        cell.add(entity);
      } else {
        const gridCoords = key.split(',').map(Number);
        const newCell = this.getCell(gridCoords[0]!, gridCoords[1]!);
        newCell.add(entity);
      }
    }
  }

  /**
   * Removes an entity from the spatial hash
   * 
   * @param entity - Entity to remove
   */
  public remove(entity: Entity): void {
    const cellKeys = this.entityCells.get(entity);
    if (!cellKeys) {
      return;
    }

    for (const key of cellKeys) {
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
    const oldCellKeys = this.entityCells.get(entity);
    const newCellKeys = this.getEntityCells(entity);

    // Check if cells changed
    if (oldCellKeys && oldCellKeys.size === newCellKeys.size) {
      let changed = false;
      for (const key of newCellKeys) {
        if (!oldCellKeys.has(key)) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        return; // No change, skip update
      }
    }

    // Re-insert
    this.insert(entity);
  }

  /**
   * Queries entities near a given entity
   * 
   * @param entity - Entity to query around
   * @returns Set of nearby entities (excluding the query entity)
   */
  public query(entity: Entity): Set<Entity> {
    const cellKeys = this.getEntityCells(entity);
    const results = new Set<Entity>();

    for (const key of cellKeys) {
      const cell = this.cells.get(key);
      if (cell) {
        for (const other of cell.entities) {
          if (other !== entity) {
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
        const key = this.getCellKey(wrappedX, wrappedY);
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
    this.entityCells.clear();
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
      totalEntities += cell.entities.size;
    }

    return {
      totalCells: this.gridWidth * this.gridHeight,
      usedCells: this.cells.size,
      totalEntities,
      averageEntitiesPerCell: this.cells.size > 0 ? totalEntities / this.cells.size : 0,
    };
  }
}

