import { World, WorldConfig } from '../world/World';
import { CardinalDirection, Entity, EntityConfig } from '../physics/Entity';
import { RegionManager, RegionManagerConfig } from '../region/RegionManager';
import { EventSystem } from '../world/events';
import { Vector2 } from '../core/math/Vector2';
import { AABB } from '../core/math/AABB';
import { assignPolygonCollider, PolygonConfig } from '../collision/PolygonCollider';
import { RaycastHit } from '../collision/raycast';
import { sweepEntities as sweepUtil, SweepResult } from '../collision/sweep';
import { MovementManager } from '../movement/MovementManager';
import { AttachedZoneConfig, StaticZoneConfig, ZoneCallbacks, ZoneManager } from './ZoneManager';

export type RPGEntityRef = Entity | string;
export type RPGMovementDirection = CardinalDirection | Vector2 | { x: number; y: number };
export type RPGFrameInput = RPGMovementDirection | {
  direction: RPGMovementDirection;
  speed?: number;
};

export type RPGHitbox =
  | number
  | { radius: number }
  | { width: number; height: number }
  | { type: 'circle'; radius: number }
  | { type: 'box' | 'aabb'; width: number; height: number }
  | { type: 'capsule'; radius: number; height: number };

export interface RPGCharacterOptions extends Omit<EntityConfig, 'uuid' | 'position' | 'velocity' | 'radius' | 'width' | 'height' | 'capsule' | 'maxLinearVelocity'> {
  x: number;
  y: number;
  hitbox: RPGHitbox;
  /** Movement speed in units per second used by moveEntity/stepFrame */
  speed: number;
  /** Optional initial velocity */
  velocity?: Vector2 | { x: number; y: number };
  /** Maximum linear velocity (defaults to speed) */
  maxLinearVelocity?: number;
}

export interface RPGStaticObstacleOptions extends Omit<EntityConfig, 'uuid' | 'position' | 'velocity' | 'mass' | 'radius' | 'width' | 'height' | 'capsule'> {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RPGSensorOptions = (
  | Omit<StaticZoneConfig, 'id' | 'position'>
  | Omit<AttachedZoneConfig, 'id' | 'entity'>
) & {
  position?: Vector2 | { x: number; y: number };
  x?: number;
  y?: number;
  entity?: RPGEntityRef;
  onEnter?: ZoneCallbacks['onEnter'];
  onExit?: ZoneCallbacks['onExit'];
};

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
  private movementManager: MovementManager | null = null;
  private zoneManager: ZoneManager | null = null;
  private readonly rpgSpeeds = new Map<string, number>();
  private tick: number = 0;

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
   * Gets the movement manager bound to this engine.
   *
   * The manager is lazily created and reused.
   *
   * @returns Movement manager instance
   */
  public getMovementManager(): MovementManager {
    if (!this.movementManager) {
      this.movementManager = MovementManager.forEngine(this);
    }
    return this.movementManager;
  }

  /**
   * Gets the zone manager bound to this engine.
   *
   * The manager is lazily created and reused. Zones allow detecting entities
   * within circular or cone-shaped areas without physical collisions (useful
   * for vision, skill ranges, explosions, etc.).
   *
   * **Important:** Call `zoneManager.update()` after each physics step to
   * keep zones synchronized:
   *
   * ```typescript
   * engine.step();
   * engine.getZoneManager().update();
   * ```
   *
   * @returns Zone manager instance
   *
   * @example
   * ```typescript
   * const zones = engine.getZoneManager();
   * const visionZone = zones.createAttachedZone(player, {
   *   radius: 100,
   *   angle: 90,
   *   direction: 'right',
   * }, {
   *   onEnter: (entities) => console.log('Player sees:', entities),
   * });
   *
   * engine.step();
   * zones.update();
   * ```
   */
  public getZoneManager(): ZoneManager {
    if (!this.zoneManager) {
      this.zoneManager = new ZoneManager(this);
    }
    return this.zoneManager;
  }

  /**
   * Updates all registered movement strategies.
   *
   * @param dt - Time delta in seconds (defaults to the world's time step)
   */
  public updateMovements(dt?: number): void {
    const manager = this.getMovementManager();
    const delta = dt ?? this.world.getTimeStep();
    manager.update(delta);
  }

  /**
   * Updates movements and then steps the simulation.
   *
   * @param dt - Time delta in seconds (defaults to the world's time step)
   */
  public stepWithMovements(dt?: number): void {
    this.updateMovements(dt);
    this.step();
  }

  /**
   * Advances the simulation by exactly one fixed tick.
   *
   * This helper is equivalent to {@link step} but returns the tick index after the step,
   * making it convenient for client-side prediction loops.
   *
   * @returns Current tick index after stepping
   */
  public stepOneTick(): number {
    this.step();
    return this.tick;
  }

  /**
   * Applies a frame of RPG movement inputs, advances the simulation, and updates sensors.
   *
   * @param inputs - Map of entity id to direction input
   * @returns Current tick index after stepping
   */
  public stepFrame(inputs: Record<string, RPGFrameInput> = {}): number {
    for (const [id, input] of Object.entries(inputs)) {
      if (this.isFrameInputObject(input)) {
        this.moveEntity(id, input.direction, input.speed);
      } else {
        this.moveEntity(id, input);
      }
    }

    this.step();
    if (this.zoneManager) {
      this.zoneManager.update();
    }
    return this.tick;
  }

  /**
   * Advances the simulation by a fixed number of ticks.
   *
   * @param ticks - Number of ticks to simulate (>= 1)
   * @returns Current tick index after stepping
   */
  public stepTicks(ticks: number): number {
    if (!Number.isFinite(ticks) || ticks <= 0) {
      return this.tick;
    }
    const total = Math.floor(ticks);
    for (let i = 0; i < total; i += 1) {
      this.step();
    }
    return this.tick;
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
   * Creates a dynamic RPG character with a stable id, hitbox, and default movement speed.
   *
   * This is the recommended creation path for players and NPCs in server-side RPG
   * simulations because the entity is registered and ready for `moveEntity` and
   * `stepFrame` immediately.
   *
   * @param id - Stable entity identifier
   * @param options - Character configuration
   * @returns Created entity
   */
  public createCharacter(id: string, options: RPGCharacterOptions): Entity {
    const { x, y, hitbox: hitboxOption, speed, velocity, maxLinearVelocity, ...entityOptions } = options;
    const hitbox = this.resolveHitbox(hitboxOption);
    const config: EntityConfig = {
      ...entityOptions,
      ...hitbox,
      uuid: id,
      position: { x, y },
      mass: options.mass ?? 1,
      maxLinearVelocity: maxLinearVelocity ?? speed,
    };
    if (velocity !== undefined) {
      config.velocity = velocity;
    }
    const entity = this.createEntity(config);
    this.rpgSpeeds.set(entity.uuid, speed);
    return entity;
  }

  /**
   * Creates a static rectangular obstacle for RPG maps.
   *
   * @param id - Stable entity identifier
   * @param options - Obstacle configuration
   * @returns Created static entity
   */
  public createStaticObstacle(id: string, options: RPGStaticObstacleOptions): Entity {
    return this.createEntity({
      ...options,
      uuid: id,
      position: { x: options.x, y: options.y },
      width: options.width,
      height: options.height,
      mass: 0,
    });
  }

  /**
   * Creates a static or attached sensor zone with a stable id.
   *
   * Sensors detect entities through the `ZoneManager` and do not create physical
   * collision responses.
   *
   * @param id - Stable sensor identifier
   * @param options - Sensor configuration
   * @returns Sensor identifier
   */
  public createSensor(id: string, options: RPGSensorOptions): string {
    const { onEnter, onExit, entity, position, x, y, ...zoneOptions } = options;
    let callbacks: ZoneCallbacks | undefined;
    if (onEnter || onExit) {
      callbacks = {};
      if (onEnter) callbacks.onEnter = onEnter;
      if (onExit) callbacks.onExit = onExit;
    }

    if (entity) {
      const attachedEntity = this.resolveEntity(entity);
      if (!attachedEntity) {
        throw new Error(`Cannot create sensor "${id}" for unknown entity`);
      }
      return this.getZoneManager().createZone({
        ...zoneOptions,
        id,
        entity: attachedEntity,
      }, callbacks);
    }

    const resolvedPosition = position ?? { x: x ?? 0, y: y ?? 0 };
    return this.getZoneManager().createZone({
      ...zoneOptions,
      id,
      position: resolvedPosition,
    }, callbacks);
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
    this.rpgSpeeds.delete(entity.uuid);
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
    this.tick += 1;
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
    this.updateEntity(entity);
  }

  /**
   * Teleports an entity by id or entity reference.
   *
   * @param entity - Entity or UUID to teleport
   * @param position - New position
   * @returns True when the entity was found
   */
  public teleportEntity(entity: RPGEntityRef, position: Vector2 | { x: number; y: number }): boolean {
    const target = this.resolveEntity(entity);
    if (!target) {
      return false;
    }
    this.teleport(target, position);
    return true;
  }

  /**
   * Moves an entity in a cardinal or vector direction using its configured RPG speed.
   *
   * Pass `'idle'` or a zero vector to stop the entity.
   *
   * @param entity - Entity or UUID to move
   * @param direction - Cardinal direction or arbitrary vector
   * @param speed - Optional speed override for this command
   * @returns True when the entity was found
   */
  public moveEntity(entity: RPGEntityRef, direction: RPGMovementDirection, speed?: number): boolean {
    const target = this.resolveEntity(entity);
    if (!target) {
      return false;
    }

    const vector = this.resolveDirection(direction);
    const magnitude = vector.length();
    if (magnitude === 0) {
      target.setVelocity({ x: 0, y: 0 });
      return true;
    }

    const resolvedSpeed = speed ?? this.rpgSpeeds.get(target.uuid) ?? target.maxLinearVelocity;
    if (!Number.isFinite(resolvedSpeed) || resolvedSpeed <= 0) {
      target.setVelocity({ x: 0, y: 0 });
      return true;
    }

    target.setVelocity({
      x: (vector.x / magnitude) * resolvedSpeed,
      y: (vector.y / magnitude) * resolvedSpeed,
    });
    return true;
  }

  /**
   * Synchronizes an entity after manual position, shape, or state changes.
   *
   * Direct mutations such as `entity.position.set(...)`, `entity.width = ...`,
   * or `entity.freeze()` bypass the world's broad-phase structures. Call this
   * helper after such mutations so spatial queries and collisions use the
   * current entity state immediately.
   *
   * @param entity - Entity to synchronize
   */
  public updateEntity(entity: Entity): void {
    if (this.useRegions && this.regionManager) {
      this.regionManager.updateEntity(entity);
    } else {
      this.world.updateEntity(entity);
    }
  }

  /**
   * Freezes an entity (makes it static)
   * 
   * @param entity - Entity to freeze
   */
  public freeze(entity: Entity): void {
    entity.freeze();
    this.updateEntity(entity);
  }

  /**
   * Unfreezes an entity (makes it dynamic)
   * 
   * @param entity - Entity to unfreeze
   */
  public unfreeze(entity: Entity): void {
    entity.unfreeze();
    this.updateEntity(entity);
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
    return this.world.queryAABB(bounds);
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
    this.rpgSpeeds.clear();
    this.tick = 0;
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
    this.updateEntity(entity);
  }

  /**
   * Casts a ray in the physics world and returns the nearest hit, if any.
   * Uses the world's spatial partition for broad-phase and shape-specific narrow-phase tests.
   *
   * @param origin - Ray origin
   * @param direction - Ray direction (any length)
   * @param maxDistance - Maximum cast length
   * @param mask - Optional collision mask (layer)
   * @param filter - Optional filter function (return true to include entity)
   * @returns Raycast hit or null
   * @example
   * ```typescript
   * const hit = engine.raycast(new Vector2(0,0), new Vector2(1,0), 1000);
   * ```
   */
  public raycast(origin: Vector2, direction: Vector2, maxDistance: number, mask?: number, filter?: (entity: Entity) => boolean): RaycastHit | null {
    return this.world.raycast(origin, direction, maxDistance, mask, filter);
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
   * Gets the current simulation tick.
   *
   * @returns Tick counter (starts at 0 and increments after each {@link step})
   */
  public getTick(): number {
    return this.tick;
  }

  /**
   * Captures a lightweight snapshot of the current world state.
   *
   * The snapshot only stores the minimum data required for client-side prediction:
   * position, velocity, rotation, angular velocity and sleeping flag per entity.
   *
   * @returns Snapshot object
   */
  public takeSnapshot(): PhysicsSnapshot {
    return {
      tick: this.tick,
      entities: this.getEntities().map((entity) => ({
        uuid: entity.uuid,
        position: { x: entity.position.x, y: entity.position.y },
        velocity: { x: entity.velocity.x, y: entity.velocity.y },
        rotation: entity.rotation,
        angularVelocity: entity.angularVelocity,
        sleeping: entity.isSleeping(),
      })),
    };
  }

  /**
   * Restores a snapshot previously produced by {@link takeSnapshot}.
   *
   * Entities that cannot be found in the current engine are skipped silently.
   *
   * @param snapshot - Snapshot to restore
   */
  public restoreSnapshot(snapshot: PhysicsSnapshot): void {
    const entities = new Map(this.getEntities().map((entity) => [entity.uuid, entity]));

    for (const state of snapshot.entities) {
      const entity = entities.get(state.uuid);
      if (!entity) continue;

      entity.position.set(state.position.x, state.position.y);
      entity.velocity.set(state.velocity.x, state.velocity.y);
      entity.rotation = state.rotation;
      entity.angularVelocity = state.angularVelocity;

      if (state.sleeping) {
        entity.sleep();
      } else {
        entity.wakeUp();
      }
      this.updateEntity(entity);
    }

    this.tick = snapshot.tick;
  }

  /**
   * Gets the region manager (if regions are enabled)
   * 
   * @returns Region manager or null
   */
  public getRegionManager(): RegionManager | null {
    return this.regionManager;
  }

  private resolveEntity(entity: RPGEntityRef): Entity | undefined {
    if (entity instanceof Entity) {
      return entity;
    }
    return this.getEntityByUUID(entity);
  }

  private resolveHitbox(hitbox: RPGHitbox): Pick<EntityConfig, 'radius' | 'width' | 'height' | 'capsule'> {
    if (typeof hitbox === 'number') {
      return { radius: hitbox };
    }

    if ('type' in hitbox) {
      if (hitbox.type === 'circle') {
        return { radius: hitbox.radius };
      }
      if (hitbox.type === 'capsule') {
        return { capsule: { radius: hitbox.radius, height: hitbox.height } };
      }
      return { width: hitbox.width, height: hitbox.height };
    }

    if ('radius' in hitbox) {
      return { radius: hitbox.radius };
    }
    return { width: hitbox.width, height: hitbox.height };
  }

  private resolveDirection(direction: RPGMovementDirection): Vector2 {
    if (direction instanceof Vector2) {
      return direction.clone();
    }

    if (typeof direction === 'string') {
      switch (direction) {
        case 'up':
          return new Vector2(0, -1);
        case 'down':
          return new Vector2(0, 1);
        case 'left':
          return new Vector2(-1, 0);
        case 'right':
          return new Vector2(1, 0);
        case 'idle':
        default:
          return new Vector2(0, 0);
      }
    }

    return new Vector2(direction.x, direction.y);
  }

  private isFrameInputObject(input: RPGFrameInput): input is { direction: RPGMovementDirection; speed?: number } {
    return typeof input === 'object' && !(input instanceof Vector2) && 'direction' in input;
  }
}

export interface PhysicsSnapshot {
  tick: number;
  entities: Array<{
    uuid: string;
    position: { x: number; y: number };
    velocity: { x: number; y: number };
    rotation: number;
    angularVelocity: number;
    sleeping: boolean;
  }>;
}
