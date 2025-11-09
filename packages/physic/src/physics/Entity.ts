import { Vector2 } from '../core/math/Vector2';
import { UUID, EntityState } from '../core/types';
import { generateUUID } from '../utils/uuid';

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

