import { Vector2 } from '../core/math/Vector2';
import { UUID, EntityState } from '../core/types';
import { generateUUID } from '../utils/uuid';
import { CollisionInfo } from '../collision/Collider';

const MOVEMENT_EPSILON = 1e-3;
const MOVEMENT_EPSILON_SQ = MOVEMENT_EPSILON * MOVEMENT_EPSILON;
const POSITION_EPSILON = 1e-3;
const DIRECTION_EPSILON_RADIANS = (5 * Math.PI) / 180;

export type CardinalDirection = 'idle' | 'up' | 'down' | 'left' | 'right';

/**
 * Configuration options for creating an entity
 */
export interface EntityConfig {
  /** Initial position */
  position?: Vector2 | { x: number; y: number };
  /** Initial velocity */
  velocity?: Vector2 | { x: number; y: number };
  /** Initial rotation in radians */
  rotation?: number;
  /** Initial angular velocity in radians per second */
  angularVelocity?: number;
  /** Mass of the entity (0 or Infinity for static/immovable entities) */
  mass?: number;
  /** Radius for circular collider */
  radius?: number;
  /** Width for AABB collider */
  width?: number;
  /** Height for AABB collider */
  height?: number;
  /** Entity state flags */
  state?: EntityState;
  /** Restitution (bounciness) coefficient (0-1) */
  restitution?: number;
  /** Friction coefficient */
  friction?: number;
  /** Linear damping (0-1, higher = more damping) */
  linearDamping?: number;
  /** Angular damping (0-1, higher = more damping) */
  angularDamping?: number;
  /** Maximum linear velocity */
  maxLinearVelocity?: number;
  /** Maximum angular velocity */
  maxAngularVelocity?: number;
  /** Custom UUID (auto-generated if not provided) */
  uuid?: UUID;
  /** Collision mask (bitmask for collision filtering) */
  collisionMask?: number;
  /** Collision category (bitmask) */
  collisionCategory?: number;
}

/**
 * Physical entity in the physics world
 * 
 * Represents a dynamic or static object that can be affected by forces,
 * collisions, and other physical interactions.
 * 
 * ## Creating Static Obstacles
 * 
 * To create immovable obstacles (walls, decorations), set `mass` to `0` or `Infinity`.
 * This makes the entity static - it will block other entities but cannot be pushed.
 * 
 * @example
 * ```typescript
 * // Dynamic entity (player, movable object)
 * const player = new Entity({
 *   position: { x: 0, y: 0 },
 *   radius: 10,
 *   mass: 1,
 *   velocity: { x: 5, y: 0 }
 * });
 * 
 * // Static obstacle (wall, tree, decoration)
 * const wall = new Entity({
 *   position: { x: 100, y: 0 },
 *   width: 20,
 *   height: 100,
 *   mass: Infinity  // or mass: 0
 * });
 * 
 * player.applyForce(new Vector2(10, 0));
 * ```
 */
export class Entity {
  /**
   * Unique identifier (UUID)
   */
  public readonly uuid: UUID;

  /**
   * Position in world space
   */
  public position: Vector2;

  /**
   * Linear velocity
   */
  public velocity: Vector2;

  /**
   * Rotation in radians
   */
  public rotation: number;

  /**
   * Angular velocity in radians per second
   */
  public angularVelocity: number;

  /**
   * Mass (0 or Infinity means infinite mass / static)
   */
  public mass: number;

  /**
   * Inverse mass (cached for performance, 0 if mass is 0 or Infinity)
   */
  public invMass: number;

  /**
   * Radius for circular collider (if used)
   */
  public radius: number;

  /**
   * Width for AABB collider (if used)
   */
  public width: number;

  /**
   * Height for AABB collider (if used)
   */
  public height: number;

  /**
   * Entity state flags
   */
  public state: EntityState;

  /**
   * Restitution (bounciness) coefficient (0-1)
   */
  public restitution: number;

  /**
   * Friction coefficient
   */
  public friction: number;

  /**
   * Linear damping (0-1)
   */
  public linearDamping: number;

  /**
   * Angular damping (0-1)
   */
  public angularDamping: number;

  /**
   * Maximum linear velocity
   */
  public maxLinearVelocity: number;

  /**
   * Maximum angular velocity
   */
  public maxAngularVelocity: number;

  /**
   * Accumulated force for this frame
   */
  public force: Vector2;

  /**
   * Accumulated torque for this frame
   */
  public torque: number;

  /**
   * Collision mask (bitmask)
   */
  public collisionMask: number;

  /**
   * Collision category (bitmask)
   */
  public collisionCategory: number;

  /**
   * Time since last movement (for sleep detection)
   */
  public timeSinceMovement: number;

  /**
   * Threshold for sleep detection (seconds of inactivity)
   */
  public sleepThreshold: number;

  private collisionEnterHandlers: Set<EntityCollisionHandler>;
  private collisionExitHandlers: Set<EntityCollisionHandler>;
  private movementHandlers: Set<EntityMovementHandler>;
  private directionHandlers: Set<EntityDirectionHandler>;
  private previousVelocity: Vector2;
  private previousPosition: Vector2;
  private previousDirection: Vector2;
  private previousCardinalDirection: CardinalDirection;
  private wasMoving: boolean;

  /**
   * Creates a new entity
   * 
   * @param config - Entity configuration
   */
  constructor(config: EntityConfig = {}) {
    // Generate UUID if not provided
    this.uuid = config.uuid ?? generateUUID();

    // Position and velocity
    if (config.position instanceof Vector2) {
      this.position = config.position.clone();
    } else if (config.position) {
      this.position = new Vector2(config.position.x, config.position.y);
    } else {
      this.position = new Vector2(0, 0);
    }

    if (config.velocity instanceof Vector2) {
      this.velocity = config.velocity.clone();
    } else if (config.velocity) {
      this.velocity = new Vector2(config.velocity.x, config.velocity.y);
    } else {
      this.velocity = new Vector2(0, 0);
    }

    // Rotation
    this.rotation = config.rotation ?? 0;
    this.angularVelocity = config.angularVelocity ?? 0;

    // Mass
    this.mass = config.mass ?? 1;
    this.invMass = this.mass > 0 ? 1 / this.mass : 0;

    // Collider dimensions
    this.radius = config.radius ?? 0;
    this.width = config.width ?? 0;
    this.height = config.height ?? 0;

    // State
    this.state = config.state ?? EntityState.Dynamic;

    // Material properties
    this.restitution = config.restitution ?? 0.2;
    this.friction = config.friction ?? 0.3;
    this.linearDamping = config.linearDamping ?? 0.01;
    this.angularDamping = config.angularDamping ?? 0.01;

    // Velocity limits
    this.maxLinearVelocity = config.maxLinearVelocity ?? Infinity;
    this.maxAngularVelocity = config.maxAngularVelocity ?? Infinity;

    // Forces
    this.force = new Vector2(0, 0);
    this.torque = 0;

    // Collision filtering
    this.collisionMask = config.collisionMask ?? 0xffffffff;
    this.collisionCategory = config.collisionCategory ?? 0x00000001;

    // Sleep detection
    this.timeSinceMovement = 0;
    this.sleepThreshold = 0.5; // 0.5 seconds of inactivity

    // Event handlers
    this.collisionEnterHandlers = new Set();
    this.collisionExitHandlers = new Set();
    this.movementHandlers = new Set();
    this.directionHandlers = new Set();

    // Motion tracking
    this.previousVelocity = this.velocity.clone();
    this.previousPosition = this.position.clone();
    this.previousDirection = this.velocity.lengthSquared() > MOVEMENT_EPSILON_SQ
      ? this.velocity.normalize()
      : Vector2.ZERO.clone();
    this.previousCardinalDirection = this.computeCardinalDirection(this.previousDirection);
    this.wasMoving = this.velocity.lengthSquared() > MOVEMENT_EPSILON_SQ;
  }

  /**
   * Registers a handler fired when this entity starts colliding with another one.
   *
   * - **Purpose:** offer per-entity collision hooks without subscribing to the global event system.
   * - **Design:** lightweight Set-based listeners returning an unsubscribe closure to keep GC pressure low.
   *
   * @param handler - Collision enter listener
   * @returns Unsubscribe closure
   * @example
   * ```typescript
   * const unsubscribe = entity.onCollisionEnter(({ other }) => {
   *   console.log('Started colliding with', other.uuid);
   * });
   * ```
   */
  public onCollisionEnter(handler: EntityCollisionHandler): () => void {
    this.collisionEnterHandlers.add(handler);
    return () => this.collisionEnterHandlers.delete(handler);
  }

  /**
   * Registers a handler fired when this entity stops colliding with another one.
   *
   * - **Purpose:** detect collision separation at the entity level for local gameplay reactions.
   * - **Design:** mirrors `onCollisionEnter` with identical lifecycle management semantics.
   *
   * @param handler - Collision exit listener
   * @returns Unsubscribe closure
   * @example
   * ```typescript
   * const unsubscribe = entity.onCollisionExit(({ other }) => {
   *   console.log('Stopped colliding with', other.uuid);
   * });
   * ```
   */
  public onCollisionExit(handler: EntityCollisionHandler): () => void {
    this.collisionExitHandlers.add(handler);
    return () => this.collisionExitHandlers.delete(handler);
  }

  /**
   * Registers a handler triggered when the entity motion changes (velocity delta, axis movement, or start/stop).
   *
   * - **Purpose:** answer \"is it moving?\" while reporting axis changes and displacement magnitude.
   * - **Design:** emits only when thresholds are exceeded to avoid flooding extremely small updates.
   *
   * @param handler - Movement change listener
   * @returns Unsubscribe closure
   * @example
   * ```typescript
   * const unsubscribe = entity.onMovementChange(({ isMoving, axisChanged }) => {
   *   if (isMoving && axisChanged.x) {
   *     console.log('Entity started moving along X');
   *   }
   * });
   * ```
   */
  public onMovementChange(handler: EntityMovementHandler): () => void {
    this.movementHandlers.add(handler);
    return () => this.movementHandlers.delete(handler);
  }

  /**
   * Registers a handler triggered when the entity heading changes by at least five degrees or the cardinal direction flips.
   *
   * - **Purpose:** expose both the fine-grained direction vector and a simplified cardinal tag (left/right/up/down/idle).
   * - **Design:** angle threshold avoids noise while still catching discrete motion changes for grid-like controls.
   *
   * @param handler - Direction change listener
   * @returns Unsubscribe closure
   * @example
   * ```typescript
   * const unsubscribe = entity.onDirectionChange(({ cardinalDirection }) => {
   *   if (cardinalDirection === 'left') {
   *     console.log('Entity now faces left');
   *   }
   * });
   * ```
   */
  public onDirectionChange(handler: EntityDirectionHandler): () => void {
    this.directionHandlers.add(handler);
    return () => this.directionHandlers.delete(handler);
  }

  /**
   * Applies a force to the entity
   * 
   * Force is accumulated and applied during integration.
   * 
   * @param force - Force vector to apply
   * @returns This entity for chaining
   * 
   * @example
   * ```typescript
   * entity.applyForce(new Vector2(10, 0)); // Push right
   * ```
   */
  public applyForce(force: Vector2): Entity {
    if (this.isStatic() || this.isSleeping()) {
      return this;
    }
    this.force.addInPlace(force);
    return this;
  }

  /**
   * Applies a force at a specific point (creates torque)
   * 
   * @param force - Force vector to apply
   * @param point - Point of application in world space
   * @returns This entity for chaining
   */
  public applyForceAtPoint(force: Vector2, point: Vector2): Entity {
    if (this.isStatic() || this.isSleeping()) {
      return this;
    }
    this.force.addInPlace(force);
    
    // Calculate torque: r × F
    const r = point.sub(this.position);
    this.torque += r.cross(force);
    
    return this;
  }

  /**
   * Applies an impulse (instantaneous change in velocity)
   * 
   * @param impulse - Impulse vector
   * @returns This entity for chaining
   * 
   * @example
   * ```typescript
   * entity.applyImpulse(new Vector2(5, 0)); // Instant push
   * ```
   */
  public applyImpulse(impulse: Vector2): Entity {
    if (this.isStatic() || this.isSleeping()) {
      return this;
    }
    this.velocity.addInPlace(impulse.mul(this.invMass));
    return this;
  }

  /**
   * Applies an angular impulse (instantaneous change in angular velocity)
   * 
   * @param impulse - Angular impulse value
   * @returns This entity for chaining
   */
  public applyAngularImpulse(impulse: number): Entity {
    if (this.isStatic() || this.isSleeping()) {
      return this;
    }
    // Simplified: assume moment of inertia = mass * radius^2
    const momentOfInertia = this.mass * this.radius * this.radius;
    if (momentOfInertia > 0) {
      this.angularVelocity += impulse / momentOfInertia;
    }
    return this;
  }

  /**
   * Teleports the entity to a new position
   * 
   * @param position - New position
   * @returns This entity for chaining
   */
  public teleport(position: Vector2 | { x: number; y: number }): Entity {
    if (position instanceof Vector2) {
      this.position.copyFrom(position);
    } else {
      this.position.set(position.x, position.y);
    }
    this.wakeUp();
    return this;
  }

  /**
   * Sets the velocity directly
   * 
   * @param velocity - New velocity
   * @returns This entity for chaining
   */
  public setVelocity(velocity: Vector2 | { x: number; y: number }): Entity {
    if (velocity instanceof Vector2) {
      this.velocity.copyFrom(velocity);
    } else {
      this.velocity.set(velocity.x, velocity.y);
    }
    this.wakeUp();
    return this;
  }

  /**
   * Freezes the entity (makes it static)
   * 
   * @returns This entity for chaining
   */
  public freeze(): Entity {
    this.state = EntityState.Static;
    this.velocity.set(0, 0);
    this.angularVelocity = 0;
    this.force.set(0, 0);
    this.torque = 0;
    return this;
  }

  /**
   * Unfreezes the entity (makes it dynamic)
   * 
   * @returns This entity for chaining
   */
  public unfreeze(): Entity {
    if (this.mass > 0) {
      this.state = EntityState.Dynamic;
    }
    return this;
  }

  /**
   * Puts the entity to sleep (stops updating)
   * 
   * @returns This entity for chaining
   */
  public sleep(): Entity {
    if (!this.isStatic()) {
      this.state |= EntityState.Sleeping;
      this.velocity.set(0, 0);
      this.angularVelocity = 0;
      this.force.set(0, 0);
      this.torque = 0;
    }
    return this;
  }

  /**
   * Wakes up the entity (resumes updating)
   * 
   * @returns This entity for chaining
   */
  public wakeUp(): Entity {
    this.state &= ~EntityState.Sleeping;
    this.timeSinceMovement = 0;
    return this;
  }

  /**
   * Checks if the entity is static
   * 
   * An entity is considered static if:
   * - It has the Static state flag, OR
   * - It has infinite mass (mass = Infinity), OR
   * - It has zero inverse mass (invMass = 0)
   * 
   * @returns True if static
   */
  public isStatic(): boolean {
    return (this.state & EntityState.Static) !== 0 || this.invMass === 0;
  }

  /**
   * Checks if the entity is dynamic
   * 
   * @returns True if dynamic
   */
  public isDynamic(): boolean {
    return (this.state & EntityState.Dynamic) !== 0 && this.mass > 0;
  }

  /**
   * Checks if the entity is sleeping
   * 
   * @returns True if sleeping
   */
  public isSleeping(): boolean {
    return (this.state & EntityState.Sleeping) !== 0;
  }

  /**
   * Checks if the entity is kinematic
   * 
   * @returns True if kinematic
   */
  public isKinematic(): boolean {
    return (this.state & EntityState.Kinematic) !== 0;
  }

  /**
   * Resets accumulated forces and torques
   * 
   * Called at the start of each physics step.
   */
  public clearForces(): void {
    this.force.set(0, 0);
    this.torque = 0;
  }

  /**
   * Clamps velocities to maximum values
   */
  public clampVelocities(): void {
    const speed = this.velocity.length();
    if (speed > this.maxLinearVelocity) {
      this.velocity.normalizeInPlace().mulInPlace(this.maxLinearVelocity);
    }
    
    if (Math.abs(this.angularVelocity) > this.maxAngularVelocity) {
      this.angularVelocity = Math.sign(this.angularVelocity) * this.maxAngularVelocity;
    }
  }

  /**
   * Checks if this entity can collide with another entity
   * 
   * @param other - Other entity to check
   * @returns True if collision is possible
   */
  public canCollideWith(other: Entity): boolean {
    // Check collision masks
    const categoryA = this.collisionCategory;
    const maskA = this.collisionMask;
    const categoryB = other.collisionCategory;
    const maskB = other.collisionMask;

    return (categoryA & maskB) !== 0 && (categoryB & maskA) !== 0;
  }

  /**
   * @internal
   *
   * Notifies the entity that a collision has started.
   *
   * @param collision - Collision information shared by the world
   * @param other - The counterpart entity
   */
  public notifyCollisionEnter(collision: CollisionInfo, other: Entity): void {
    if (this.collisionEnterHandlers.size === 0) {
      return;
    }

    const payload: EntityCollisionEvent = {
      entity: this,
      other,
      collision,
    };

    for (const handler of this.collisionEnterHandlers) {
      handler(payload);
    }
  }

  /**
   * @internal
   *
   * Notifies the entity that a collision has ended.
   *
   * @param collision - Collision information stored before separation
   * @param other - The counterpart entity
   */
  public notifyCollisionExit(collision: CollisionInfo, other: Entity): void {
    if (this.collisionExitHandlers.size === 0) {
      return;
    }

    const payload: EntityCollisionEvent = {
      entity: this,
      other,
      collision,
    };

    for (const handler of this.collisionExitHandlers) {
      handler(payload);
    }
  }

  /**
   * @internal
   *
   * Updates cached motion data and emits movement/direction events when thresholds are crossed.
   *
   * @param deltaTime - Simulation delta time
   */
  public updateMotionTracking(deltaTime: number): void {
    const currentVelocity = this.velocity.clone();
    const currentPosition = this.position.clone();
    const deltaPosition = currentPosition.sub(this.previousPosition);

    const xChanged = Math.abs(deltaPosition.x) > POSITION_EPSILON;
    const yChanged = Math.abs(deltaPosition.y) > POSITION_EPSILON;
    const isMoving = currentVelocity.lengthSquared() > MOVEMENT_EPSILON_SQ;
    const velocityDelta =
      currentVelocity.sub(this.previousVelocity).lengthSquared() > MOVEMENT_EPSILON_SQ;

    if (
      this.movementHandlers.size > 0 &&
      (xChanged || yChanged || velocityDelta || this.wasMoving !== isMoving)
    ) {
      const movementPayload: EntityMovementEvent = {
        entity: this,
        deltaTime,
        velocity: currentVelocity.clone(),
        previousVelocity: this.previousVelocity.clone(),
        position: currentPosition.clone(),
        previousPosition: this.previousPosition.clone(),
        deltaPosition,
        isMoving,
        axisChanged: {
          x: xChanged,
          y: yChanged,
        },
      };

      for (const handler of this.movementHandlers) {
        handler(movementPayload);
      }
    }

    let currentDirection = new Vector2(0, 0);
    let currentCardinal: CardinalDirection = 'idle';
    let directionChanged = false;

    if (isMoving) {
      currentDirection = currentVelocity.clone().normalizeInPlace();
      currentCardinal = this.computeCardinalDirection(currentDirection);

      if (!this.wasMoving) {
        directionChanged = true;
      } else {
        const dot = Math.max(
          -1,
          Math.min(1, this.previousDirection.dot(currentDirection)),
        );
        const angle = Math.acos(dot);
        if (angle >= DIRECTION_EPSILON_RADIANS) {
          directionChanged = true;
        }
      }

      if (currentCardinal !== this.previousCardinalDirection) {
        directionChanged = true;
      }
    } else if (this.wasMoving || this.previousCardinalDirection !== 'idle') {
      directionChanged = true;
    }

    if (directionChanged && this.directionHandlers.size > 0) {
      const directionPayload: EntityDirectionEvent = {
        entity: this,
        direction: currentDirection.clone(),
        previousDirection: this.previousDirection.clone(),
        cardinalDirection: currentCardinal,
        previousCardinalDirection: this.previousCardinalDirection,
      };

      for (const handler of this.directionHandlers) {
        handler(directionPayload);
      }
    }

    this.previousVelocity.copyFrom(this.velocity);
    this.previousPosition.copyFrom(this.position);
    if (isMoving) {
      this.previousDirection.copyFrom(currentDirection);
    } else {
      this.previousDirection.set(0, 0);
    }
    this.previousCardinalDirection = isMoving ? currentCardinal : 'idle';
    this.wasMoving = isMoving;
  }

  private computeCardinalDirection(direction: Vector2): CardinalDirection {
    if (direction.lengthSquared() <= MOVEMENT_EPSILON_SQ) {
      return 'idle';
    }

    const absX = Math.abs(direction.x);
    const absY = Math.abs(direction.y);

    if (absX >= absY) {
      return direction.x >= 0 ? 'right' : 'left';
    }

    return direction.y >= 0 ? 'down' : 'up';
  }

  /**
   * Creates a copy of this entity
   * 
   * @returns New entity with copied properties
   */
  public clone(): Entity {
    const entity = new Entity({
      position: this.position.clone(),
      velocity: this.velocity.clone(),
      rotation: this.rotation,
      angularVelocity: this.angularVelocity,
      mass: this.mass,
      radius: this.radius,
      width: this.width,
      height: this.height,
      state: this.state,
      restitution: this.restitution,
      friction: this.friction,
      linearDamping: this.linearDamping,
      angularDamping: this.angularDamping,
      maxLinearVelocity: this.maxLinearVelocity,
      maxAngularVelocity: this.maxAngularVelocity,
      collisionMask: this.collisionMask,
      collisionCategory: this.collisionCategory,
      uuid: this.uuid,
    });
    return entity;
  }
}

export interface EntityCollisionEvent {
  entity: Entity;
  other: Entity;
  collision: CollisionInfo;
}

export type EntityCollisionHandler = (event: EntityCollisionEvent) => void;

export interface EntityMovementEvent {
  entity: Entity;
  deltaTime: number;
  velocity: Vector2;
  previousVelocity: Vector2;
  position: Vector2;
  previousPosition: Vector2;
  deltaPosition: Vector2;
  isMoving: boolean;
  axisChanged: {
    x: boolean;
    y: boolean;
  };
}

export type EntityMovementHandler = (event: EntityMovementEvent) => void;

export interface EntityDirectionEvent {
  entity: Entity;
  direction: Vector2;
  previousDirection: Vector2;
  cardinalDirection: CardinalDirection;
  previousCardinalDirection: CardinalDirection;
}

export type EntityDirectionHandler = (event: EntityDirectionEvent) => void;

