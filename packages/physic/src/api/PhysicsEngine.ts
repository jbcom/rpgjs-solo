import { World, WorldConfig } from '../world/World';
import { Entity, EntityConfig } from '../physics/Entity';
import { RegionManager, RegionManagerConfig } from '../region/RegionManager';
import { EventSystem } from '../world/events';
import { Vector2 } from '../core/math/Vector2';
import { AABB } from '../core/math/AABB';
import type { SpatialPartition } from '../world/SpatialPartition';
import { assignPolygonCollider, PolygonConfig } from '../collision/PolygonCollider';
import { raycast as raycastUtil, RaycastHit } from '../collision/raycast';
import { sweepEntities as sweepUtil, SweepResult } from '../collision/sweep';

/**
 * Physics engine configuration
 */
export interface PhysicsEngineConfig extends WorldConfig {
  /** Enable region-based simulation (default: false) */
  enableRegions?: boolean;
  /** Region manager configuration (required if enableRegions is true) */
  regionConfig?: RegionManagerConfig;
}

/**
 * Main physics engine interface
 * 
 * Provides a high-level, gameplay-oriented API for physics simulation.
 * Supports both single-world and multi-region simulation modes.
 * 
 * @example
 * ```typescript
 * const engine = new PhysicsEngine({ timeStep: 1/60 });
 * const entity = engine.createEntity({
 *   position: { x: 0, y: 0 },
 *   radius: 10,
 *   mass: 1
 * });
 * 
 * engine.step();
 * ```
 */
export class PhysicsEngine {
  private world: World;
  private regionManager: RegionManager | null = null;
  private useRegions: boolean;

  /**
   * Creates a new physics engine
   * 
   * @param config - Engine configuration
   */
  constructor(config: PhysicsEngineConfig = {}) {
    this.useRegions = config.enableRegions ?? false;

    if (this.useRegions) {
      if (!config.regionConfig) {
        throw new Error('Region configuration is required when enableRegions is true');
      }
      this.regionManager = new RegionManager(config.regionConfig);
      // Create a minimal world for entities not in regions
      this.world = new World({
        ...config,
        enableSleep: false, // Regions handle sleep
      });
    } else {
      this.world = new World(config);
    }
  }

  /**
   * Creates a new entity
   * 
   * @param config - Entity configuration
   * @returns Created entity
   * 
   * @example
   * ```typescript
   * const entity = engine.createEntity({
   *   position: { x: 100, y: 100 },
   *   radius: 15,
   *   mass: 1,
   *   velocity: { x: 5, y: 0 }
   * });
   * ```
   */
  public createEntity(config: EntityConfig): Entity {
    const entity = new Entity(config);

    if (this.useRegions && this.regionManager) {
      this.regionManager.addEntity(entity);
    } else {
      this.world.addEntity(entity);
    }

    return entity;
  }

  /**
   * Adds an existing entity to the engine
   * 
   * @param entity - Entity to add
   * @returns The added entity
   */
  public addEntity(entity: Entity): Entity {
    if (this.useRegions && this.regionManager) {
      this.regionManager.addEntity(entity);
    } else {
      this.world.addEntity(entity);
    }
    return entity;
  }

  /**
   * Removes an entity from the engine
   * 
   * @param entity - Entity to remove
   */
  public removeEntity(entity: Entity): void {
    if (this.useRegions && this.regionManager) {
      this.regionManager.removeEntity(entity);
    } else {
      this.world.removeEntity(entity);
    }
  }

  /**
   * Gets all entities
   * 
   * @returns Array of all entities
   */
  public getEntities(): Entity[] {
    if (this.useRegions && this.regionManager) {
      const entities: Entity[] = [];
      for (const region of this.regionManager.getRegions()) {
        entities.push(...region.getEntities());
      }
      return entities;
    }
    return this.world.getEntities();
  }

  /**
   * Gets an entity by UUID
   * 
   * @param uuid - Entity UUID
   * @returns Entity or undefined
   */
  public getEntityByUUID(uuid: string): Entity | undefined {
    if (this.useRegions && this.regionManager) {
      for (const region of this.regionManager.getRegions()) {
        const entity = region.getWorld().getEntityByUUID(uuid);
        if (entity) {
          return entity;
        }
      }
      return undefined;
    }
    return this.world.getEntityByUUID(uuid);
  }

  /**
   * Steps the physics simulation forward
   * 
   * Updates all entities, detects and resolves collisions.
   */
  public step(): void {
    if (this.useRegions && this.regionManager) {
      this.regionManager.step();
    } else {
      this.world.step();
    }
  }

  /**
   * Gets the event system
   * 
   * @returns Event system instance
   */
  public getEvents(): EventSystem {
    return this.world.getEvents();
  }

  /**
   * Applies a force to an entity
   * 
   * @param entity - Entity to apply force to
   * @param force - Force vector
   */
  public applyForce(entity: Entity, force: Vector2): void {
    entity.applyForce(force);
  }

  /**
   * Applies an impulse to an entity
   * 
   * @param entity - Entity to apply impulse to
   * @param impulse - Impulse vector
   */
  public applyImpulse(entity: Entity, impulse: Vector2): void {
    entity.applyImpulse(impulse);
  }

  /**
   * Teleports an entity to a new position
   * 
   * @param entity - Entity to teleport
   * @param position - New position
   */
  public teleport(entity: Entity, position: Vector2 | { x: number; y: number }): void {
    entity.teleport(position);

    // Update region if using regions
    if (this.useRegions && this.regionManager) {
      this.regionManager.updateEntities();
    }
  }

  /**
   * Freezes an entity (makes it static)
   * 
   * @param entity - Entity to freeze
   */
  public freeze(entity: Entity): void {
    entity.freeze();
  }

  /**
   * Unfreezes an entity (makes it dynamic)
   * 
   * @param entity - Entity to unfreeze
   */
  public unfreeze(entity: Entity): void {
    entity.unfreeze();
  }

  /**
   * Queries entities in an AABB region
   * 
   * @param bounds - AABB to query
   * @returns Array of entities in the region
   */
  public queryAABB(bounds: AABB): Entity[] {
    if (this.useRegions && this.regionManager) {
      const entities: Entity[] = [];
      const regions = this.regionManager.getRegionsInBounds(bounds);
      for (const region of regions) {
        const world = region.getWorld();
        const worldEntities = world.getEntities();
        for (const entity of worldEntities) {
          if (bounds.contains(entity.position)) {
            entities.push(entity);
          }
        }
      }
      return entities;
    }
    // Use spatial partition from world
    const world = this.world as any;
    if (world.spatialPartition) {
      return Array.from(world.spatialPartition.queryAABB(bounds));
    }
    // Fallback to checking all entities
    return this.world.getEntities().filter((e) => bounds.contains(e.position));
  }

  /**
   * Clears all entities from the engine
   */
  public clear(): void {
    if (this.useRegions && this.regionManager) {
      this.regionManager.clear();
    } else {
      this.world.clear();
    }
  }

  /**
   * Assigns a polygon collider to an entity (supports convex or concave via convex parts).
   *
   * Design: the collider is attached via a registry and used by the detector on demand.
   * This keeps entities lightweight and preserves the separation of detection/resolution.
   *
   * @param entity - Target entity
   * @param config - Polygon configuration
   * @example
   * ```typescript
   * engine.assignPolygonCollider(entity, { vertices: [new Vector2(-1,-1), new Vector2(1,-1), new Vector2(1,1), new Vector2(-1,1)], isConvex: true });
   * ```
   */
  public assignPolygonCollider(entity: Entity, config: PolygonConfig): void {
    assignPolygonCollider(entity, config);
  }

  /**
   * Casts a ray in the physics world and returns the nearest hit, if any.
   * Uses the world's spatial partition for broad-phase and shape-specific narrow-phase tests.
   *
   * @param origin - Ray origin
   * @param direction - Ray direction (any length)
   * @param maxDistance - Maximum cast length
   * @returns Raycast hit or null
   * @example
   * ```typescript
   * const hit = engine.raycast(new Vector2(0,0), new Vector2(1,0), 1000);
   * ```
   */
  public raycast(origin: Vector2, direction: Vector2, maxDistance: number): RaycastHit | null {
    const world = this.world as any;
    const partition: SpatialPartition | undefined = world.spatialPartition;
    if (!partition) return null;
    return raycastUtil(partition, origin, direction, maxDistance);
  }

  /**
   * Computes continuous collision detection (sweep test) time-of-impact between two entities
   * over the next step of duration `dt`, using relative motion.
   *
   * @param a - First entity
   * @param b - Second entity
   * @param dt - Time step duration
   * @returns Sweep result or null if no hit in [0,1]
   * @example
   * ```typescript
   * const toi = engine.sweep(entityA, entityB, 1/60);
   * if (toi) {
   *   // pre-resolve or clamp motion
   * }
   * ```
   */
  public sweep(a: Entity, b: Entity, dt: number): SweepResult | null {
    const rel = a.velocity.sub(b.velocity).mul(dt);
    return sweepUtil(a, b, rel);
  }

  /**
   * Gets statistics about the engine
   * 
   * @returns Statistics object
   */
  public getStats(): {
    totalEntities: number;
    dynamicEntities: number;
    staticEntities: number;
    sleepingEntities: number;
    regions?: {
      total: number;
      active: number;
    };
  } {
    if (this.useRegions && this.regionManager) {
      const regionStats = this.regionManager.getStats();
      const worldStats = this.world.getStats();
      return {
        ...worldStats,
        regions: {
          total: regionStats.totalRegions,
          active: regionStats.activeRegions,
        },
      };
    }
    return this.world.getStats();
  }

  /**
   * Gets the underlying world instance
   * 
   * @returns World instance
   */
  public getWorld(): World {
    return this.world;
  }

  /**
   * Gets the region manager (if regions are enabled)
   * 
   * @returns Region manager or null
   */
  public getRegionManager(): RegionManager | null {
    return this.regionManager;
  }
}

