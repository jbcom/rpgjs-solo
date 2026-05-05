import { Region } from './Region';
import { Entity } from '../physics/Entity';
import { AABB } from '../core/math/AABB';
import { Vector2 } from '../core/math/Vector2';

/**
 * Region manager configuration
 */
export interface RegionManagerConfig {
  /** World bounds */
  worldBounds: AABB;
  /** Region size (width and height) */
  regionSize: number;
  /** Overlap between regions */
  overlap?: number;
  /** Auto-activate regions based on entity presence (default: true) */
  autoActivate?: boolean;
}

/**
 * Region manager
 * 
 * Manages multiple regions in a distributed physics world.
 * Handles entity migration between regions and region activation/deactivation.
 *
 * @experimental Region simulation is not the recommended default path for
 * RPG-JS server physics yet. Prefer `PhysicsEngine` without regions until
 * migration semantics, events, stats, and config propagation are fully
 * benchmarked and documented.
 * 
 * @example
 * ```typescript
 * const manager = new RegionManager({
 *   worldBounds: new AABB(0, 0, 1000, 1000),
 *   regionSize: 200,
 *   overlap: 20
 * });
 * ```
 */
export class RegionManager {
  private regions: Region[] = [];
  private regionMap: Map<string, Region> = new Map();
  private config: Required<Omit<RegionManagerConfig, 'worldBounds'>> & { worldBounds: AABB };
  private entityRegionMap: Map<Entity, Region> = new Map();

  /**
   * Creates a new region manager
   * 
   * @param config - Manager configuration
   */
  constructor(config: RegionManagerConfig) {
    this.config = {
      worldBounds: config.worldBounds,
      regionSize: config.regionSize,
      overlap: config.overlap ?? 0,
      autoActivate: config.autoActivate ?? true,
    };

    this.createRegions();
  }

  /**
   * Creates the grid of regions
   */
  private createRegions(): void {
    const { worldBounds, regionSize, overlap } = this.config;
    const worldWidth = worldBounds.getWidth();
    const worldHeight = worldBounds.getHeight();

    const cols = Math.ceil(worldWidth / regionSize);
    const rows = Math.ceil(worldHeight / regionSize);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const minX = worldBounds.minX + col * regionSize;
        const minY = worldBounds.minY + row * regionSize;
        const maxX = Math.min(minX + regionSize, worldBounds.maxX);
        const maxY = Math.min(minY + regionSize, worldBounds.maxY);

        const bounds = new AABB(minX, minY, maxX, maxY);
        const region = new Region({
          bounds,
          overlap,
          active: !this.config.autoActivate, // Start inactive if auto-activate is enabled
        });

        const key = this.getRegionKey(col, row);
        this.regions.push(region);
        this.regionMap.set(key, region);
      }
    }
  }

  /**
   * Gets a region key from grid coordinates
   * 
   * @param col - Column index
   * @param row - Row index
   * @returns Region key string
   */
  private getRegionKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  /**
   * Gets the region containing a point
   * 
   * @param point - Point to find region for
   * @returns Region or null
   */
  public getRegionAt(point: Vector2): Region | null {
    for (const region of this.regions) {
      if (region.contains(point)) {
        return region;
      }
    }
    return null;
  }

  /**
   * Gets all regions that overlap with an AABB
   * 
   * @param bounds - AABB to check
   * @returns Array of overlapping regions
   */
  public getRegionsInBounds(bounds: AABB): Region[] {
    const result: Region[] = [];
    for (const region of this.regions) {
      if (region.getExpandedBounds().intersects(bounds)) {
        result.push(region);
      }
    }
    return result;
  }

  /**
   * Adds an entity to the appropriate region
   * 
   * @param entity - Entity to add
   */
  public addEntity(entity: Entity): void {
    const region = this.getRegionAt(entity.position);
    if (region) {
      region.addEntity(entity);
      this.entityRegionMap.set(entity, region);

      if (this.config.autoActivate) {
        region.activate();
      }
    }
  }

  /**
   * Removes an entity from its region
   * 
   * @param entity - Entity to remove
   */
  public removeEntity(entity: Entity): void {
    const region = this.entityRegionMap.get(entity);
    if (region) {
      region.removeEntity(entity);
      this.entityRegionMap.delete(entity);

      if (this.config.autoActivate && region.getEntities().length === 0) {
        region.deactivate();
      }
    }
  }

  /**
   * Synchronizes an entity with its current region, migrating it when needed.
   *
   * @param entity - Entity to synchronize
   */
  public updateEntity(entity: Entity): void {
    const currentRegion = this.entityRegionMap.get(entity);
    const newRegion = this.getRegionAt(entity.position);

    if (!newRegion) {
      if (currentRegion) {
        currentRegion.removeEntity(entity);
        this.entityRegionMap.delete(entity);
      }
      return;
    }

    if (!currentRegion) {
      newRegion.addEntity(entity);
      this.entityRegionMap.set(entity, newRegion);
      if (this.config.autoActivate) {
        newRegion.activate();
      }
      return;
    }

    if (newRegion !== currentRegion) {
      currentRegion.removeEntity(entity);
      newRegion.addEntity(entity);
      this.entityRegionMap.set(entity, newRegion);
      if (this.config.autoActivate) {
        newRegion.activate();
      }
      if (this.config.autoActivate && currentRegion.getEntities().length === 0) {
        currentRegion.deactivate();
      }
      return;
    }

    currentRegion.getWorld().updateEntity(entity);
  }

  /**
   * Updates entity positions and migrates them between regions if needed
   */
  public updateEntities(): void {
    const entitiesToMigrate: Array<{ entity: Entity; newRegion: Region }> = [];

    for (const [entity, currentRegion] of this.entityRegionMap) {
      if (!currentRegion.shouldContain(entity)) {
        const newRegion = this.getRegionAt(entity.position);
        if (newRegion && newRegion !== currentRegion) {
          entitiesToMigrate.push({ entity, newRegion });
        }
      }
    }

    // Perform migrations
    for (const { entity } of entitiesToMigrate) {
      this.updateEntity(entity);
    }
  }

  /**
   * Steps all active regions
   */
  public step(): void {
    // Update entity positions first
    this.updateEntities();

    // Step each active region
    for (const region of this.regions) {
      if (region.isActive()) {
        region.step();
      }
    }
  }

  /**
   * Gets all regions
   * 
   * @returns Array of all regions
   */
  public getRegions(): Region[] {
    return [...this.regions];
  }

  /**
   * Gets active regions
   * 
   * @returns Array of active regions
   */
  public getActiveRegions(): Region[] {
    return this.regions.filter((r) => r.isActive());
  }

  /**
   * Gets the region containing an entity
   * 
   * @param entity - Entity to find region for
   * @returns Region or null
   */
  public getEntityRegion(entity: Entity): Region | null {
    return this.entityRegionMap.get(entity) ?? null;
  }

  /**
   * Clears all entities from all regions
   */
  public clear(): void {
    for (const region of this.regions) {
      const entities = region.getEntities();
      for (const entity of entities) {
        region.removeEntity(entity);
      }
    }
    this.entityRegionMap.clear();
  }

  /**
   * Gets statistics about regions
   * 
   * @returns Statistics object
   */
  public getStats(): {
    totalRegions: number;
    activeRegions: number;
    totalEntities: number;
  } {
    let totalEntities = 0;
    for (const region of this.regions) {
      totalEntities += region.getEntities().length;
    }

    return {
      totalRegions: this.regions.length,
      activeRegions: this.getActiveRegions().length,
      totalEntities,
    };
  }
}
