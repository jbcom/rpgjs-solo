import { Entity } from '../physics/Entity';
import { Integrator, IntegrationMethod } from '../physics/integrator';
import { CollisionResolver } from '../collision/resolver';
import { SpatialHash } from '../collision/spatial-hash';
import { testCollision } from '../collision/detector';
import { CollisionInfo } from '../collision/Collider';
import { EventSystem } from './events';
import { SpatialPartition } from './SpatialPartition';
import { Vector2 } from '../core/math/Vector2';
import type { EntityConfig } from '../physics/Entity';

/**
 * World configuration
 */
export interface WorldConfig {
  /** Time step for simulation (default: 1/60 for 60 FPS) */
  timeStep?: number;
  /** Integration method (default: Euler) */
  integrationMethod?: IntegrationMethod;
  /** Gravity vector (default: zero for top-down) */
  gravity?: Vector2;
  /** Spatial partition cell size (default: 100) */
  spatialCellSize?: number;
  /** Spatial partition grid width (default: 100) */
  spatialGridWidth?: number;
  /** Spatial partition grid height (default: 100) */
  spatialGridHeight?: number;
  /** Enable sleep detection (default: true) */
  enableSleep?: boolean;
  /** Sleep threshold in seconds (default: 0.5) */
  sleepThreshold?: number;
  /** Velocity threshold for sleep detection (default: 0.01) */
  sleepVelocityThreshold?: number;
  /** Custom spatial partition (optional) */
  spatialPartition?: SpatialPartition;
  /**
   * Optional quantization step (world units) applied to positions after every tick.
   * Set to a positive number (e.g. 1/16) to reduce floating point drift for networking.
   */
  positionQuantizationStep?: number;
  /**
   * Optional quantization step (world units / second) applied to velocities after every tick.
   * Set to a positive number (e.g. 1/256) to enforce deterministic clamps.
   */
  velocityQuantizationStep?: number;
  /**
   * Number of collision-resolution iterations per tick (default: 3).
   * Higher values further reduce interpenetration in crowded scenes.
   */
  resolverIterations?: number;
  /** Custom collision resolver factor controlling how aggressively overlaps are corrected. */
  positionCorrectionFactor?: number;
  /** Maximum positional correction applied per iteration (world units). */
  maxPositionCorrection?: number;
  /** Minimum penetration depth before a collision is resolved. */
  minPenetrationDepth?: number;
}

/**
 * Physics world
 * 
 * Manages entities, physics simulation, collisions, and events.
 * 
 * @example
 * ```typescript
 * const world = new World({ timeStep: 1/60 });
 * const entity = world.addEntity({ position: { x: 0, y: 0 }, radius: 10 });
 * world.step();
 * ```
 */
export class World {
  private entities: Set<Entity> = new Set();
  // Separate collections for performance
  private staticEntities: Set<Entity> = new Set();
  private dynamicEntities: Set<Entity> = new Set();
  private integrator: Integrator;
  private resolver: CollisionResolver;
  private spatialPartition: SpatialPartition;
  private events: EventSystem;
  private timeStep: number;
  private enableSleep: boolean;
  private sleepThreshold: number;
  private sleepVelocityThreshold: number;
  private previousCollisions: Map<string, CollisionInfo> = new Map();
  private readonly positionQuantizationStep: number | null;
  private readonly velocityQuantizationStep: number | null;
  private readonly resolverIterations: number;

  /**
   * Creates a new physics world
   * 
   * @param config - World configuration
   */
  constructor(config: WorldConfig = {}) {
    this.timeStep = config.timeStep ?? 1 / 60;
    this.enableSleep = config.enableSleep ?? true;
    this.sleepThreshold = config.sleepThreshold ?? 0.5;
    this.sleepVelocityThreshold = config.sleepVelocityThreshold ?? 0.01;
    this.positionQuantizationStep =
      typeof config.positionQuantizationStep === 'number' && config.positionQuantizationStep > 0
        ? config.positionQuantizationStep
        : null;
    this.velocityQuantizationStep =
      typeof config.velocityQuantizationStep === 'number' && config.velocityQuantizationStep > 0
        ? config.velocityQuantizationStep
        : null;

    // Create integrator
    const integratorConfig: {
      deltaTime: number;
      method?: IntegrationMethod;
      gravity?: Vector2;
    } = {
      deltaTime: this.timeStep,
      method: config.integrationMethod ?? IntegrationMethod.Euler,
    };
    if (config.gravity) {
      integratorConfig.gravity = config.gravity;
    }
    this.integrator = new Integrator(integratorConfig);

    // Create collision resolver
    this.resolverIterations = Math.max(1, Math.floor(config.resolverIterations ?? 3));
    this.resolver = new CollisionResolver({
      positionCorrectionFactor: config.positionCorrectionFactor,
      maxPositionCorrection: config.maxPositionCorrection,
      minPenetrationDepth: config.minPenetrationDepth,
    });

    // Create spatial partition
    if (config.spatialPartition) {
      this.spatialPartition = config.spatialPartition;
    } else {
      this.spatialPartition = new SpatialHash(
        config.spatialCellSize ?? 100,
        config.spatialGridWidth ?? 100,
        config.spatialGridHeight ?? 100
      );
    }

    // Create event system
    this.events = new EventSystem();
  }

  /**
   * Gets the event system
   * 
   * @returns Event system instance
   */
  public getEvents(): EventSystem {
    return this.events;
  }

  /**
   * Returns the fixed simulation time step.
   *
   * @returns Time step in seconds
   */
  public getTimeStep(): number {
    return this.timeStep;
  }

  /**
   * Adds an entity to the world
   * 
   * @param entity - Entity to add
   * @returns The added entity
   */
  public addEntity(entity: Entity): Entity {
    this.entities.add(entity);
    if (entity.isStatic()) {
      this.staticEntities.add(entity);
    } else {
      this.dynamicEntities.add(entity);
    }
    this.spatialPartition.insert(entity);
    this.events.emitEntityAdded(entity);
    return entity;
  }

  /**
   * Creates and adds a new entity
   * 
   * @param config - Entity configuration
   * @returns Created entity
   */
  public createEntity(config: EntityConfig): Entity {
    const entity = new Entity(config);
    return this.addEntity(entity);
  }

  /**
   * Removes an entity from the world
   * 
   * @param entity - Entity to remove
   */
  public removeEntity(entity: Entity): void {
    if (this.entities.delete(entity)) {
      this.staticEntities.delete(entity);
      this.dynamicEntities.delete(entity);
      this.spatialPartition.remove(entity);
      this.events.emitEntityRemoved(entity);
    }
  }

  /**
   * Gets all entities in the world
   * 
   * @returns Array of entities
   */
  public getEntities(): Entity[] {
    return Array.from(this.entities);
  }

  /**
   * Gets an entity by UUID
   * 
   * @param uuid - Entity UUID
   * @returns Entity or undefined
   */
  public getEntityByUUID(uuid: string): Entity | undefined {
    for (const entity of this.entities) {
      if (entity.uuid === uuid) {
        return entity;
      }
    }
    return undefined;
  }

  /**
   * Steps the physics simulation forward
   * 
   * Updates all entities, detects and resolves collisions.
   */
  public step(): void {
    // Update spatial partition with the latest positions
    this.refreshDynamicEntitiesInPartition();

    // Clear forces and integrate
    for (const entity of this.dynamicEntities) {
      if (!entity.isSleeping()) {
        entity.clearForces();
        this.integrator.integrate(entity);
      }
    }

    let firstPassCollisions: CollisionInfo[] = [];
    for (let iteration = 0; iteration < this.resolverIterations; iteration++) {
      const collisions = this.detectCollisions();
      if (iteration === 0) {
        firstPassCollisions = collisions;
      }
      if (collisions.length === 0) {
        break;
      }
      this.sortCollisionsForDeterminism(collisions);
      this.resolver.resolveAll(collisions);
      if (iteration + 1 < this.resolverIterations) {
        this.refreshDynamicEntitiesInPartition();
      }
    }

    if (this.positionQuantizationStep !== null || this.velocityQuantizationStep !== null) {
      this.quantizeEntities();
    }

    this.handleCollisionEvents(firstPassCollisions);

    if (this.enableSleep) {
      this.updateSleepState();
    }
  }

  /**
   * Detects collisions using spatial partition
   * 
   * @returns Array of collision infos
   */
  private detectCollisions(): CollisionInfo[] {
    const collisions: CollisionInfo[] = new Array();
    const checkedPairs = new Set<string>();

    // Only dynamic entities initiate collision checks
    for (const entity of this.dynamicEntities) {

      // Query nearby entities
      const nearby = this.spatialPartition.query(entity);

      for (const other of nearby) {
        // Create unique pair key
        const pairKey = entity.uuid < other.uuid
          ? `${entity.uuid}-${other.uuid}`
          : `${other.uuid}-${entity.uuid}`;

        if (checkedPairs.has(pairKey)) {
          continue;
        }
        checkedPairs.add(pairKey);

        // Test collision
        const collision = testCollision(entity, other);
        if (collision) {
          collisions.push(collision);
        }
      }
    }

    return collisions;
  }

  private sortCollisionsForDeterminism(collisions: CollisionInfo[]): void {
    collisions.sort((a, b) => {
      const keyA = this.getCollisionKey(a);
      const keyB = this.getCollisionKey(b);
      return keyA.localeCompare(keyB);
    });
  }

  private getCollisionKey(collision: CollisionInfo): string {
    const idA = collision.entityA.uuid;
    const idB = collision.entityB.uuid;
    return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
  }

  /**
   * Handles collision enter/exit events
   * 
   * @param collisions - Current frame collisions
   */
  private handleCollisionEvents(collisions: CollisionInfo[]): void {
    const currentCollisions = new Map<string, CollisionInfo>();

    // Process current collisions
    for (const collision of collisions) {
      const pairKey = collision.entityA.uuid < collision.entityB.uuid
        ? `${collision.entityA.uuid}-${collision.entityB.uuid}`
        : `${collision.entityB.uuid}-${collision.entityA.uuid}`;

      currentCollisions.set(pairKey, collision);

      // Check if this is a new collision
      if (!this.previousCollisions.has(pairKey)) {
        this.events.emitCollisionEnter(collision);
        collision.entityA.notifyCollisionEnter(collision, collision.entityB);
        collision.entityB.notifyCollisionEnter(collision, collision.entityA);
      }
    }

    // Check for exit collisions
    for (const [pairKey, collision] of this.previousCollisions) {
      if (!currentCollisions.has(pairKey)) {
        this.events.emitCollisionExit(collision);
        collision.entityA.notifyCollisionExit(collision, collision.entityB);
        collision.entityB.notifyCollisionExit(collision, collision.entityA);
      }
    }

    // Update previous collisions
    this.previousCollisions = currentCollisions;
  }


  /**
   * Updates sleep state for entities
   */
  private updateSleepState(): void {
    for (const entity of this.entities) {
      if (entity.isStatic() || entity.isSleeping()) {
        continue;
      }

      const speed = entity.velocity.length();
      const angularSpeed = Math.abs(entity.angularVelocity);

      if (speed < this.sleepVelocityThreshold && angularSpeed < this.sleepVelocityThreshold) {
        entity.timeSinceMovement += this.timeStep;

        if (entity.timeSinceMovement >= this.sleepThreshold) {
          entity.sleep();
          this.events.emitEntitySleep(entity);
        }
      } else {
        entity.timeSinceMovement = 0;
        if (entity.isSleeping()) {
          entity.wakeUp();
          this.events.emitEntityWake(entity);
        }
      }
    }
  }

  /**
   * Clears all entities from the world
   */
  public clear(): void {
    for (const entity of this.entities) {
      this.events.emitEntityRemoved(entity);
    }
    this.entities.clear();
    this.spatialPartition.clear();
    this.previousCollisions.clear();
  }

  private quantizeEntities(): void {
    for (const entity of this.dynamicEntities) {
      if (this.positionQuantizationStep !== null) {
        entity.position.x = this.quantizeValue(entity.position.x, this.positionQuantizationStep);
        entity.position.y = this.quantizeValue(entity.position.y, this.positionQuantizationStep);
      }
      if (this.velocityQuantizationStep !== null) {
        entity.velocity.x = this.quantizeValue(entity.velocity.x, this.velocityQuantizationStep);
        entity.velocity.y = this.quantizeValue(entity.velocity.y, this.velocityQuantizationStep);
      }
    }
  }

  private quantizeValue(value: number, step: number): number {
    return Math.round(value / step) * step;
  }

  private refreshDynamicEntitiesInPartition(): void {
    for (const entity of this.dynamicEntities) {
      this.spatialPartition.update(entity);
    }
  }

  /**
   * Gets statistics about the world
   * 
   * @returns Statistics object
   */
  public getStats(): {
    totalEntities: number;
    dynamicEntities: number;
    staticEntities: number;
    sleepingEntities: number;
  } {
    let dynamic = 0;
    let static_ = 0;
    let sleeping = 0;

    for (const entity of this.entities) {
      if (entity.isStatic()) {
        static_++;
      } else {
        dynamic++;
      }
      if (entity.isSleeping()) {
        sleeping++;
      }
    }

    return {
      totalEntities: this.entities.size,
      dynamicEntities: dynamic,
      staticEntities: static_,
      sleepingEntities: sleeping,
    };
  }
}

