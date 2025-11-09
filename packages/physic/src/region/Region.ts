import { World } from '../world/World';
import { Entity } from '../physics/Entity';
import { AABB } from '../core/math/AABB';
import { Vector2 } from '../core/math/Vector2';

/**
 * Region configuration
 */
export interface RegionConfig {
  /** Region bounds */
  bounds: AABB;
  /** Overlap size with neighboring regions (default: 0) */
  overlap?: number;
  /** Whether this region is active (default: true) */
  active?: boolean;
}

/**
 * Physical region in a distributed world
 * 
 * Represents an independent simulation zone that can contain entities.
 * Regions can overlap to allow smooth entity transitions.
 * 
 * @example
 * ```typescript
 * const region = new Region({
 *   bounds: new AABB(0, 0, 100, 100),
 *   overlap: 10
 * });
 * ```
 */
export class Region {
  private world: World;
  private bounds: AABB;
  private overlap: number;
  private active: boolean;
  private entities: Set<Entity> = new Set();

  /**
   * Creates a new region
   * 
   * @param config - Region configuration
   */
  constructor(config: RegionConfig) {
    this.bounds = config.bounds.clone();
    this.overlap = config.overlap ?? 0;
    this.active = config.active ?? true;

    // Create world for this region
    this.world = new World({
      spatialCellSize: 50,
      spatialGridWidth: 50,
      spatialGridHeight: 50,
    });
  }

  /**
   * Gets the region bounds
   * 
   * @returns AABB bounds
   */
  public getBounds(): AABB {
    return this.bounds.clone();
  }

  /**
   * Gets the expanded bounds including overlap
   * 
   * @returns Expanded AABB
   */
  public getExpandedBounds(): AABB {
    return this.bounds.expand(this.overlap);
  }

  /**
   * Checks if a point is inside this region
   * 
   * @param point - Point to check
   * @returns True if point is inside
   */
  public contains(point: Vector2): boolean {
    return this.bounds.contains(point);
  }

  /**
   * Checks if an entity should belong to this region
   * 
   * @param entity - Entity to check
   * @returns True if entity should be in this region
   */
  public shouldContain(entity: Entity): boolean {
    return this.bounds.contains(entity.position);
  }

  /**
   * Adds an entity to this region
   * 
   * @param entity - Entity to add
   */
  public addEntity(entity: Entity): void {
    if (this.entities.has(entity)) {
      return;
    }
    this.entities.add(entity);
    this.world.addEntity(entity);
  }

  /**
   * Removes an entity from this region
   * 
   * @param entity - Entity to remove
   */
  public removeEntity(entity: Entity): void {
    if (this.entities.delete(entity)) {
      this.world.removeEntity(entity);
    }
  }

  /**
   * Gets all entities in this region
   * 
   * @returns Array of entities
   */
  public getEntities(): Entity[] {
    return Array.from(this.entities);
  }

  /**
   * Steps the region's physics simulation
   */
  public step(): void {
    if (!this.active) {
      return;
    }
    this.world.step();
  }

  /**
   * Activates this region
   */
  public activate(): void {
    this.active = true;
  }

  /**
   * Deactivates this region
   */
  public deactivate(): void {
    this.active = false;
  }

  /**
   * Checks if this region is active
   * 
   * @returns True if active
   */
  public isActive(): boolean {
    return this.active;
  }

  /**
   * Gets the world instance for this region
   * 
   * @returns World instance
   */
  public getWorld(): World {
    return this.world;
  }

  /**
   * Checks if this region overlaps with another region
   * 
   * @param other - Other region to check
   * @returns True if regions overlap
   */
  public overlaps(other: Region): boolean {
    const expandedA = this.getExpandedBounds();
    const expandedB = other.getExpandedBounds();
    return expandedA.intersects(expandedB);
  }

  /**
   * Gets entities that might need migration to neighboring regions
   * 
   * @returns Array of entities near region boundaries
   */
  public getBoundaryEntities(): Entity[] {
    const boundaryEntities: Entity[] = [];
    const expandedBounds = this.getExpandedBounds();

    for (const entity of this.entities) {
      // Check if entity is in overlap zone
      if (expandedBounds.contains(entity.position) && !this.bounds.contains(entity.position)) {
        boundaryEntities.push(entity);
      }
    }

    return boundaryEntities;
  }
}

