import { Vector2 } from '../core/math/Vector2';
import { UUID, EntityState } from '../core/types';
import { generateUUID } from '../utils/uuid';
import { CollisionInfo } from '../collision/Collider';

const MOVEMENT_EPSILON = 1e-3;
const MOVEMENT_EPSILON_SQ = MOVEMENT_EPSILON * MOVEMENT_EPSILON;
const DIRECTION_CHANGE_THRESHOLD = 1.0;
const DIRECTION_CHANGE_THRESHOLD_SQ = DIRECTION_CHANGE_THRESHOLD * DIRECTION_CHANGE_THRESHOLD;

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
  /** Capsule collider configuration (if used) */
  capsule?: {
    radius: number;
    height: number;
  };
  /** Enable continuous collision detection (CCD) */
  continuous?: boolean;
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
   * Capsule collider configuration (if used)
   */
  public capsule?: {
    radius: number;
    height: number;
  };

  /**
   * Enable continuous collision detection (CCD)
   */
  public continuous: boolean;

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
   * Current tile coordinates (x, y)
   */
  public currentTile: Vector2;

  private collisionEnterHandlers: Set<EntityCollisionHandler>;
  private collisionExitHandlers: Set<EntityCollisionHandler>;
  private positionSyncHandlers: Set<EntityPositionSyncHandler>;
  private directionSyncHandlers: Set<EntityDirectionSyncHandler>;
  private movementChangeHandlers: Set<EntityMovementChangeHandler>;
  private enterTileHandlers: Set<EntityTileHandler>;
  private leaveTileHandlers: Set<EntityTileHandler>;
  private canEnterTileHandlers: Set<EntityCanEnterTileHandler>;
  private wasMoving: boolean;
  private lastCardinalDirection: CardinalDirection = 'idle';

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

    this.currentTile = new Vector2(0, 0); // Will be updated by World

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
    if (config.capsule !== undefined) {
      this.capsule = config.capsule;
    }
    this.continuous = config.continuous ?? false;

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
    this.positionSyncHandlers = new Set();
    this.directionSyncHandlers = new Set();
    this.positionSyncHandlers = new Set();
    this.directionSyncHandlers = new Set();
    this.movementChangeHandlers = new Set();
    this.enterTileHandlers = new Set();
    this.leaveTileHandlers = new Set();
    this.canEnterTileHandlers = new Set();

    // Initialize movement state
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
   * Registers a handler fired when the entity position changes (x, y).
   *
   * - **Purpose:** synchronize position changes for logging, rendering, network sync, etc.
   * - **Design:** lightweight Set-based listeners returning an unsubscribe closure to keep GC pressure low.
   *
   * @param handler - Position change listener
   * @returns Unsubscribe closure
   * @example
   * ```typescript
   * const unsubscribe = entity.onPositionChange(({ x, y }) => {
   *   console.log('Position changed to', x, y);
   *   // Update rendering, sync network, etc.
   * });
   * ```
   */
  public onPositionChange(handler: EntityPositionSyncHandler): () => void {
    this.positionSyncHandlers.add(handler);
    return () => this.positionSyncHandlers.delete(handler);
  }

  /**
   * Registers a handler fired when the entity direction changes.
   *
   * - **Purpose:** synchronize direction changes for logging, rendering, network sync, etc.
   * - **Design:** lightweight Set-based listeners returning an unsubscribe closure to keep GC pressure low.
   *
   * @param handler - Direction change listener
   * @returns Unsubscribe closure
   * @example
   * ```typescript
   * const unsubscribe = entity.onDirectionChange(({ direction, cardinalDirection }) => {
   *   console.log('Direction changed to', cardinalDirection);
   *   // Update rendering, sync network, etc.
   * });
   * ```
   */
  public onDirectionChange(handler: EntityDirectionSyncHandler): () => void {
    this.directionSyncHandlers.add(handler);
    return () => this.directionSyncHandlers.delete(handler);
  }

  /**
   * Manually notifies that the position has changed.
   *
   * - **Purpose:** allow external code to trigger position sync hooks when position is modified directly.
   * - **Design:** can be called after direct position modifications (e.g., `entity.position.set()`).
   *
   * @example
   * ```typescript
   * entity.position.set(100, 200);
   * entity.notifyPositionChange(); // Trigger sync hooks
   * ```
   */
  public notifyPositionChange(): void {
    if (this.positionSyncHandlers.size === 0) {
      return;
    }

    const payload: EntityPositionSyncEvent = {
      entity: this,
      x: this.position.x,
      y: this.position.y,
    };

    for (const handler of this.positionSyncHandlers) {
      handler(payload);
    }
  }

  /**
   * Manually notifies that the direction has changed.
   *
   * - **Purpose:** allow external code to trigger direction sync hooks when direction is modified directly.
   * - **Design:** computes direction from velocity and cardinal direction.
   *
   * @example
   * ```typescript
   * entity.velocity.set(5, 0);
   * entity.notifyDirectionChange(); // Trigger sync hooks
   * ```
   */
  public notifyDirectionChange(): void {
    const isMoving = this.velocity.lengthSquared() > DIRECTION_CHANGE_THRESHOLD_SQ;
    const direction = isMoving ? this.velocity.clone().normalize() : new Vector2(0, 0);
    const cardinalDirection = this.computeCardinalDirection(direction);

    // Update state to support hysteresis
    if (cardinalDirection !== 'idle') {
      this.lastCardinalDirection = cardinalDirection;
    }

    if (this.directionSyncHandlers.size === 0) {
      return;
    }

    const payload: EntityDirectionSyncEvent = {
      entity: this,
      direction,
      cardinalDirection,
    };

    for (const handler of this.directionSyncHandlers) {
      handler(payload);
    }
  }

  /**
   * Gets the current cardinal direction.
   * 
   * This value is updated whenever `notifyDirectionChange()` is called (e.g. by `setVelocity`).
   * It includes hysteresis logic to prevent rapid direction flipping during collisions.
   * 
   * @returns The current cardinal direction ('up', 'down', 'left', 'right', 'idle')
   * 
   * @example
   * ```typescript
   * const dir = entity.cardinalDirection;
   * if (dir === 'left') {
   *   // Render left-facing sprite
   * }
   * ```
   */
  public get cardinalDirection(): CardinalDirection {
    return this.lastCardinalDirection;
  }

  /**
   * Registers a handler fired when the entity movement state changes (moving/stopped).
   *
   * - **Purpose:** detect when an entity starts or stops moving for gameplay reactions, animations, or network sync.
   * - **Design:** lightweight Set-based listeners returning an unsubscribe closure to keep GC pressure low.
   * - **Movement detection:** uses `MOVEMENT_EPSILON` threshold to determine if entity is moving.
   * - **Intensity:** provides the movement speed magnitude to allow fine-grained animation control (e.g., walk vs run).
   *
   * @param handler - Movement state change listener
   * @returns Unsubscribe closure
   * @example
   * ```typescript
   * const unsubscribe = entity.onMovementChange(({ isMoving, intensity }) => {
   *   console.log('Entity is', isMoving ? 'moving' : 'stopped', 'at speed', intensity);
   *   // Update animations based on intensity
   *   if (isMoving && intensity > 100) {
   *     // Fast movement - use run animation
   *   } else if (isMoving) {
   *     // Slow movement - use walk animation
   *   }
   * });
   * ```
   */
  public onMovementChange(handler: EntityMovementChangeHandler): () => void {
    this.movementChangeHandlers.add(handler);
    return () => this.movementChangeHandlers.delete(handler);
  }

  /**
   * Manually notifies that the movement state has changed.
   *
   * - **Purpose:** allow external code to trigger movement state sync hooks when velocity is modified directly.
   * - **Design:** checks if movement state (moving/stopped) has changed and notifies handlers with movement intensity.
   * - **Intensity:** calculated as the magnitude of the velocity vector (speed in pixels per second).
   *
   * @example
   * ```typescript
   * entity.velocity.set(5, 0);
   * entity.notifyMovementChange(); // Trigger sync hooks if state changed
   * ```
   */
  public notifyMovementChange(): void {
    const isMoving = this.velocity.lengthSquared() > MOVEMENT_EPSILON_SQ;
    const intensity = this.velocity.length(); // Movement speed magnitude

    if (this.movementChangeHandlers.size === 0) {
      // Still update wasMoving even if no handlers to track state correctly
      this.wasMoving = isMoving;
      return;
    }

    // Only notify if state actually changed
    if (isMoving !== this.wasMoving) {
      this.wasMoving = isMoving;

      const payload: EntityMovementChangeEvent = {
        entity: this,
        isMoving,
        intensity,
      };

      for (const handler of this.movementChangeHandlers) {
        handler(payload);
      }
    } else {
      // Update wasMoving even if state didn't change to keep it in sync
      this.wasMoving = isMoving;
    }
  }

  /**
   * Registers a handler fired when the entity enters a new tile.
   * 
   * @param handler - Tile enter listener
   * @returns Unsubscribe closure
   */
  public onEnterTile(handler: EntityTileHandler): () => void {
    this.enterTileHandlers.add(handler);
    return () => this.enterTileHandlers.delete(handler);
  }

  /**
   * Registers a handler fired when the entity leaves a tile.
   * 
   * @param handler - Tile leave listener
   * @returns Unsubscribe closure
   */
  public onLeaveTile(handler: EntityTileHandler): () => void {
    this.leaveTileHandlers.add(handler);
    return () => this.leaveTileHandlers.delete(handler);
  }

  /**
   * Registers a handler to check if the entity can enter a tile.
   * If any handler returns false, the entity cannot enter.
   * 
   * @param handler - Can enter tile listener
   * @returns Unsubscribe closure
   */
  public canEnterTile(handler: EntityCanEnterTileHandler): () => void {
    this.canEnterTileHandlers.add(handler);
    return () => this.canEnterTileHandlers.delete(handler);
  }

  /**
   * @internal
   * Notifies that the entity has entered a tile.
   */
  public notifyEnterTile(x: number, y: number): void {
    if (this.enterTileHandlers.size === 0) return;
    const event: EntityTileEvent = { entity: this, x, y };
    for (const handler of this.enterTileHandlers) {
      handler(event);
    }
  }

  /**
   * @internal
   * Notifies that the entity has left a tile.
   */
  public notifyLeaveTile(x: number, y: number): void {
    if (this.leaveTileHandlers.size === 0) return;
    const event: EntityTileEvent = { entity: this, x, y };
    for (const handler of this.leaveTileHandlers) {
      handler(event);
    }
  }

  /**
   * @internal
   * Checks if the entity can enter a tile.
   */
  public checkCanEnterTile(x: number, y: number): boolean {
    if (this.canEnterTileHandlers.size === 0) return true;
    const event: EntityTileEvent = { entity: this, x, y };
    for (const handler of this.canEnterTileHandlers) {
      if (handler(event) === false) {
        return false;
      }
    }
    return true;
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
    this.notifyMovementChange();
    this.notifyDirectionChange();
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
    this.notifyPositionChange();
    return this;
  }

  /**
   * Sets the velocity directly
   * 
   * @param velocity - New velocity
   * @returns This entity for chaining
   */
  public setVelocity(velocity: Vector2 | { x: number; y: number }): Entity {
    const oldVelocity = this.velocity.clone();

    if (velocity instanceof Vector2) {
      this.velocity.copyFrom(velocity);
    } else {
      this.velocity.set(velocity.x, velocity.y);
    }
    this.wakeUp();

    // Check if direction changed
    const oldDirection = oldVelocity.lengthSquared() > MOVEMENT_EPSILON_SQ
      ? oldVelocity.clone().normalize()
      : new Vector2(0, 0);
    const newDirection = this.velocity.lengthSquared() > MOVEMENT_EPSILON_SQ
      ? this.velocity.clone().normalize()
      : new Vector2(0, 0);

    const oldCardinal = this.computeCardinalDirection(oldDirection);
    const newCardinal = this.computeCardinalDirection(newDirection);

    if (oldCardinal !== newCardinal || Math.abs(oldDirection.dot(newDirection) - 1) > 0.01) {
      this.notifyDirectionChange();
    }

    // Check if movement state changed
    this.notifyMovementChange();

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
    this.notifyMovementChange();
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
      this.notifyMovementChange();
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
   * Stops all movement immediately
   * 
   * Completely stops the entity's movement by:
   * - Setting velocity to zero
   * - Setting angular velocity to zero
   * - Clearing accumulated forces and torques
   * - Waking up the entity if it was sleeping
   * - Notifying movement state change
   * 
   * Unlike `freeze()`, this method keeps the entity dynamic and does not
   * change its state. It's useful for stopping movement when changing maps,
   * teleporting, or when you need to halt an entity without making it static.
   * 
   * @returns This entity for chaining
   * 
   * @example
   * ```ts
   * // Stop movement when changing maps
   * if (mapChanged) {
   *   entity.stopMovement();
   * }
   * 
   * // Stop movement after teleporting
   * entity.position.set(100, 200);
   * entity.stopMovement();
   * 
   * // Stop movement when player dies
   * if (player.isDead()) {
   *   playerEntity.stopMovement();
   * }
   * ```
   */
  public stopMovement(): Entity {
    this.velocity.set(0, 0);
    this.angularVelocity = 0;
    this.clearForces();
    this.wakeUp();
    this.notifyMovementChange();
    this.notifyDirectionChange();
    return this;
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


  private computeCardinalDirection(direction: Vector2): CardinalDirection {
    if (direction.lengthSquared() <= MOVEMENT_EPSILON_SQ) {
      return 'idle';
    }

    // If we were idle, just return the strongest direction without bias
    if (this.lastCardinalDirection === 'idle') {
      const absX = Math.abs(direction.x);
      const absY = Math.abs(direction.y);
      if (absX >= absY) {
        return direction.x >= 0 ? 'right' : 'left';
      }
      return direction.y >= 0 ? 'down' : 'up';
    }

    // Check for 180-degree flips (Bounce protection)
    // If the new direction is strictly opposite to the last one, we require a higher velocity
    // to accept the change. This filters out collision rebounds.
    const isOpposite =
      (this.lastCardinalDirection === 'left' && direction.x > 0.5) ||
      (this.lastCardinalDirection === 'right' && direction.x < -0.5) ||
      (this.lastCardinalDirection === 'up' && direction.y > 0.5) ||
      (this.lastCardinalDirection === 'down' && direction.y < -0.5);

    const speedSq = this.velocity.lengthSquared();

    // Threshold to accept a 180-degree turn (avoid jitter on bounce)
    // We expect a "real" turn to have some acceleration or accumulated velocity
    if (isOpposite && speedSq < 100.0) { // Speed < 10
      return this.lastCardinalDirection;
    }

    const absX = Math.abs(direction.x);
    const absY = Math.abs(direction.y);
    const bias = 2.0; // Strong bias to keep current direction

    // Hysteresis: favor current axis if we have a valid last direction
    if (['left', 'right'].includes(this.lastCardinalDirection)) {
      // Currently horizontal: stick to it unless vertical is significantly stronger
      // AND vertical component has meaningful speed (prevents slide when blocked)
      if (absY > absX * bias) {
         // Check if the "new" vertical movement is actually significant
         // e.g. if we are blocked Horizontally (x=0), absY will win even if it's 0.0001 without this check
         if (Math.abs(this.velocity.y) > 5.0) {
             return direction.y >= 0 ? 'down' : 'up';
         }
      }
      // Default: keep horizontal orientation, just update sign if needed (and not filtered by opposite check)
      // If we are here, it means we didn't switch axis, and we didn't trigger the "Opposite" guard above.
      // However, if we are "blocked" (velocity very low), we should probably not even flip sign.
      if (speedSq > 1.0) {
        return direction.x >= 0 ? 'right' : 'left';
      }
      return this.lastCardinalDirection;
    } else {
      // Currently vertical: stick to it unless horizontal is significantly stronger
      if (absX > absY * bias) {
         if (Math.abs(this.velocity.x) > 5.0) {
            return direction.x >= 0 ? 'right' : 'left';
         }
      }
      if (speedSq > 1.0) {
        return direction.y >= 0 ? 'down' : 'up';
      }
      return this.lastCardinalDirection;
    }
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


export interface EntityPositionSyncEvent {
  entity: Entity;
  x: number;
  y: number;
}

export type EntityPositionSyncHandler = (event: EntityPositionSyncEvent) => void;

export interface EntityDirectionSyncEvent {
  entity: Entity;
  direction: Vector2;
  cardinalDirection: CardinalDirection;
}

export type EntityDirectionSyncHandler = (event: EntityDirectionSyncEvent) => void;

export interface EntityMovementChangeEvent {
  entity: Entity;
  isMoving: boolean;
  /** Movement intensity (speed magnitude) */
  intensity: number;
}

export type EntityMovementChangeHandler = (event: EntityMovementChangeEvent) => void;

export interface EntityTileEvent {
  entity: Entity;
  x: number;
  y: number;
}

export type EntityTileHandler = (event: EntityTileEvent) => void;
export type EntityCanEnterTileHandler = (event: EntityTileEvent) => boolean;


