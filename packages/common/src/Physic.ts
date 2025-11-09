import {
  assignPolygonCollider,
  Entity,
  EntityState,
  PhysicsEngine,
  Vector2,
} from "@rpgjs/physic";
import type { CollisionInfo } from "@rpgjs/physic";
import { Direction, RpgCommonPlayer } from "./Player";

/**
 * ## Zone configuration
 *
 * Describes the options accepted when creating an analytical detection zone.
 * Zones can either be defined by world coordinates or linked to an existing hitbox.
 */
export interface ZoneOptions {
  /** World x-coordinate (ignored when `linkedTo` is provided) */
  x?: number;
  /** World y-coordinate (ignored when `linkedTo` is provided) */
  y?: number;
  /** Circle radius (px) */
  radius: number;
  /** Vision aperture in degrees. 360 = full circle, <360 = cone */
  angle?: number;
  /** Facing direction used when angle < 360 */
  direction?: Direction;
  /** If supplied, zone tracks this hitbox id */
  linkedTo?: string;
  /** If true, walls (static hitboxes) stop vision */
  limitedByWalls?: boolean;
  /** Optional semantic hint for UI integrations */
  positioning?: "center" | "top" | "bottom" | "left" | "right";
  /** Friendly name for debugging */
  name?: string;
  /** Arbitrary metadata forwarded with events */
  properties?: object;
}

/**
 * ## Sliding hint
 *
 * Preserves the legacy shape of sliding options even though the new physics
 * backend does not implement per-entity sliding yet. Keeping the interface
 * allows feature parity with existing userland code.
 */
export interface SlidingOptions {
  /** Enable collision sliding */
  enabled?: boolean;
  /** Sliding friction factor (0-1, where 0 = no sliding, 1 = perfect sliding) */
  friction?: number;
  /** Minimum velocity threshold for sliding to occur */
  minVelocity?: number;
}

/**
 * Snapshot describing a physics body at a given frame for game-logic consumers.
 */
export interface PhysicsBodySnapshot {
  /** Logical identifier of the entity */
  id: string;
  /** Geometric center in world coordinates */
  center: { x: number; y: number };
  /** Top-left corner in world coordinates */
  topLeft: { x: number; y: number };
  /** Linear velocity vector */
  velocity: { x: number; y: number };
  /** Current width of the collider */
  width: number;
  /** Current height of the collider */
  height: number;
}

const MOVEMENT_DISTANCE_EPSILON = 0.25;
const VELOCITY_EPSILON = 0.1;

interface CollisionCallbackSet {
  onCollisionEnter?: (collidedWith: string[]) => void;
  onCollisionExit?: (collidedWith: string[]) => void;
}

interface MovementState {
  isMoving: boolean;
  onStartMoving?: () => void;
  onStopMoving?: () => void;
  lastPosition: Vector2;
}

interface HitboxRecord {
  id: string;
  type: "static" | "movable";
  entity: Entity;
  width: number;
  height: number;
  owner?: any;
  isStatic: boolean;
}

interface ZoneBody {
  position: Vector2;
  radius: number;
  angle: number;
  direction: Direction;
}

interface ZoneRecord {
  id: string;
  type: "static" | "linked";
  body: ZoneBody;
  linkedTo?: string;
  limitedByWalls: boolean;
  inside: Set<string>;
  onEnter?: (hitIds: string[]) => void;
  onExit?: (hitIds: string[]) => void;
}

interface SlidingState {
  enabled: boolean;
  options?: SlidingOptions;
}

interface RectBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function directionToAngle(dir: Direction): number {
  switch (dir) {
    case Direction.Up:
      return -Math.PI / 2;
    case Direction.Down:
      return Math.PI / 2;
    case Direction.Left:
      return Math.PI;
    case Direction.Right:
    default:
      return 0;
  }
}

function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * ## Overview
 *
 * Bridges the gameplay layer with the deterministic engine provided by `@rpgjs/physic`.
 * The class keeps the legacy API that the Matter.js wrapper exposed, while internally
 * delegating all simulation to the new engine.
 *
 * - Entities are registered as `@rpgjs/physic` AABB or polygon bodies.
 * - Collision lifecycle is forwarded via lightweight callback registries.
 * - Zones are analytical checks evaluated once per physics frame.
 *
 * @example
 * ```ts
 * const physic = new RpgCommonPhysic();
 * const id = physic.addMovableHitbox(player, 100, 100, 32, 32);
 * physic.update(16);
 * ```
 */
export class RpgCommonPhysic {
  private readonly engine: PhysicsEngine;
  private readonly fixedStepMs: number;
  private accumulator = 0;

  private readonly hitboxes = new Map<string, HitboxRecord>();
  private readonly collisions = new Map<string, Set<string>>();
  private readonly collisionCallbacks = new Map<string, CollisionCallbackSet>();
  private readonly movementStates = new Map<string, MovementState>();
  private readonly zones = new Map<string, ZoneRecord>();
  private readonly slidingStates = new Map<string, SlidingState>();

  private readonly unsubscribeCollisionEnter: () => void;
  private readonly unsubscribeCollisionExit: () => void;

  /**
   * ## Purpose
   *
   * Instantiate the deterministic engine and prepare collision observers.
   *
   * ## Design Notes
   *
   * The engine runs with a fixed `1/60` step, zero gravity, and sleeping disabled
   * to mimic the previous top-down configuration.
   *
   * @example
   * ```ts
   * const physic = new RpgCommonPhysic();
   * ```
   */
  constructor() {
    this.engine = new PhysicsEngine({
      timeStep: 1 / 60,
      gravity: new Vector2(0, 0),
      enableSleep: false,
    });
    this.fixedStepMs = this.engine.getWorld().getTimeStep() * 1000;
    const events = this.engine.getEvents();
    this.unsubscribeCollisionEnter = events.onCollisionEnter((collision) => {
      this.onCollisionEnter(collision);
    });
    this.unsubscribeCollisionExit = events.onCollisionExit((collision) => {
      this.onCollisionExit(collision);
    });
  }

  /**
   * ## Purpose
   *
   * Reset the physics world to a pristine state.
   *
  * ## Design
   *
   * Delegates entity removal to the engine and clears every local registry
   * (collisions, zones, movement state, sliding hints).
   *
   * @example
   * ```ts
   * physic.clearAll();
   * ```
   */
  clearAll(): void {
    this.engine.clear();
    this.hitboxes.clear();
    this.collisions.clear();
    this.collisionCallbacks.clear();
    this.movementStates.clear();
    this.zones.clear();
    this.slidingStates.clear();
    this.accumulator = 0;
  }

  /**
   * ## Purpose
   *
   * Register an immovable obstacle in the physics world.
   *
   * ## Design
   *
   * Supports both rectangular hitboxes and polygonal shapes.
   * When polygons are provided, their points are converted to local-space vertices.
   *
   * @example
   * ```ts
   * physic.addStaticHitbox("wall", 50, 50, 32, 128);
   * ```
   */
  addStaticHitbox(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): string;

  /**
   * @example
   * ```ts
   * physic.addStaticHitbox("triangle", [
   *   [0, 0],
   *   [64, 0],
   *   [32, 48],
   * ]);
   * ```
   */
  addStaticHitbox(id: string, points: number[][]): string;

  addStaticHitbox(
    id: string,
    xOrPoints: number | number[][],
    y?: number,
    width?: number,
    height?: number,
  ): string {
    if (this.hitboxes.has(id) || this.zones.has(id)) {
      throw new Error(`Hitbox with id ${id} already exists`);
    }

    let entity: Entity;
    let boxWidth: number;
    let boxHeight: number;

    if (Array.isArray(xOrPoints)) {
      const points = xOrPoints;
      if (points.length < 3) {
        throw new Error(
          `Polygon must have at least 3 points, got ${points.length}`,
        );
      }

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const point of points) {
        if (
          !Array.isArray(point) ||
          point.length !== 2 ||
          typeof point[0] !== "number" ||
          typeof point[1] !== "number"
        ) {
          throw new Error(
            `Invalid point ${JSON.stringify(point)}. Expected [x, y].`,
          );
        }
        minX = Math.min(minX, point[0]);
        maxX = Math.max(maxX, point[0]);
        minY = Math.min(minY, point[1]);
        maxY = Math.max(maxY, point[1]);
      }

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      boxWidth = Math.max(maxX - minX, 1);
      boxHeight = Math.max(maxY - minY, 1);

      entity = this.engine.createEntity({
        uuid: id,
        position: { x: centerX, y: centerY },
        width: boxWidth,
        height: boxHeight,
        mass: Infinity,
        state: EntityState.Static,
      });
      entity.freeze();

      const localVertices = points.map(
        ([px, py]) => new Vector2(px - centerX, py - centerY),
      );
      assignPolygonCollider(entity, { vertices: localVertices });
    } else {
      if (
        typeof y !== "number" ||
        typeof width !== "number" ||
        typeof height !== "number"
      ) {
        throw new Error(
          "Rectangle hitbox requires x, y, width and height parameters",
        );
      }

      const centerX = xOrPoints + width / 2;
      const centerY = y + height / 2;
      boxWidth = Math.max(width, 1);
      boxHeight = Math.max(height, 1);

      entity = this.engine.createEntity({
        uuid: id,
        position: { x: centerX, y: centerY },
        width: boxWidth,
        height: boxHeight,
        mass: Infinity,
        state: EntityState.Static,
      });
      entity.freeze();
    }

    const record: HitboxRecord = {
      id,
      type: "static",
      entity,
      width: boxWidth,
      height: boxHeight,
      owner: undefined,
      isStatic: true,
    };

    this.hitboxes.set(id, record);
    this.collisions.set(id, new Set());
    return id;
  }

  /**
   * ## Purpose
   *
   * Register a movable hitbox and bind it to a gameplay object.
   *
   * ## Design
   *
   * Coordinates are expressed in top-left space to preserve compatibility with the legacy API.
   * The underlying entity stores its position at the collider center.
   *
   * @example
   * ```ts
   * physic.addMovableHitbox(player, 100, 100, 32, 32);
   * ```
   */
  addMovableHitbox(
    owner: RpgCommonPlayer | any,
    x: number,
    y: number,
    width: number,
    height: number,
    options: { isStatic?: boolean; friction?: number } = {},
    slidingOptions?: SlidingOptions,
  ): string {
    const id = owner?.id;
    if (!id || typeof id !== "string") {
      throw new Error("Movable hitbox requires the owner to have a string id");
    }

    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const isStatic = !!options.isStatic;

    const entity = this.engine.createEntity({
      uuid: id,
      position: { x: centerX, y: centerY },
      width,
      height,
      mass: isStatic ? Infinity : 1,
      friction: options.friction ?? 0.3,
      restitution: 0,
      state: isStatic ? EntityState.Static : EntityState.Dynamic,
    });

    if (isStatic) {
      entity.freeze();
    } else {
      entity.unfreeze();
    }

    const record: HitboxRecord = {
      id,
      type: "movable",
      entity,
      width,
      height,
      owner,
      isStatic,
    };

    this.hitboxes.set(id, record);
    this.collisions.set(id, new Set());
    this.movementStates.set(id, {
      isMoving: false,
      lastPosition: entity.position.clone(),
    });

    if (slidingOptions) {
      this.setSliding(id, slidingOptions.enabled ?? false, slidingOptions);
    }

    return id;
  }

  /**
   * ## Purpose
   *
   * Update the position and optionally the size of an existing hitbox.
   *
   * ## Design
   *
   * The method re-computes the center from the provided top-left coordinates
   * to maintain compatibility with previous callers.
   *
   * @example
   * ```ts
   * physic.updateHitbox("player1", 200, 180, 48, 48);
   * ```
   */
  updateHitbox(
    id: string,
    x: number,
    y: number,
    width?: number,
    height?: number,
  ): boolean {
    const record = this.hitboxes.get(id);
    if (!record) return false;

    if (typeof width === "number" && typeof height === "number") {
      record.width = Math.max(width, 1);
      record.height = Math.max(height, 1);
      record.entity.width = record.width;
      record.entity.height = record.height;
    }

    const centerX = x + record.width / 2;
    const centerY = y + record.height / 2;
    record.entity.position.set(centerX, centerY);

    const movement = this.movementStates.get(id);
    if (movement) {
      movement.lastPosition.set(centerX, centerY);
    }

    return true;
  }

  /**
   * ## Purpose
   *
   * Remove a hitbox and all associated state from the physics world.
   *
   * ## Design
   *
   * Cleans collision sets, movement observers and zone caches referencing the id.
   *
   * @example
   * ```ts
   * physic.removeHitbox("wall");
   * ```
   */
  removeHitbox(id: string): boolean {
    const record = this.hitboxes.get(id);
    if (!record) {
      return false;
    }

    this.engine.removeEntity(record.entity);
    this.hitboxes.delete(id);
    this.collisions.delete(id);
    this.collisionCallbacks.delete(id);
    this.movementStates.delete(id);
    this.slidingStates.delete(id);

    for (const [, set] of this.collisions.entries()) {
      set.delete(id);
    }
    for (const zone of this.zones.values()) {
      zone.inside.delete(id);
      if (zone.linkedTo === id) {
        zone.linkedTo = undefined;
      }
    }

    return true;
  }

  /**
   * ## Purpose
   *
   * Subscribe to collision enter/exit events for a given hitbox.
   *
   * ## Design
   *
   * Collisions are emitted as simple arrays of ids to mirror the legacy behaviour.
   *
   * @example
   * ```ts
   * physic.registerCollisionEvents("player1", ids => console.log(ids));
   * ```
   */
  registerCollisionEvents(
    id: string,
    onCollisionEnter?: (collidedWith: string[]) => void,
    onCollisionExit?: (collidedWith: string[]) => void,
  ): void {
    this.collisionCallbacks.set(id, { onCollisionEnter, onCollisionExit });
  }

  /**
   * ## Purpose
   *
   * Retrieve the ids of all entities currently colliding with the provided id.
   *
   * @example
   * ```ts
   * const ids = physic.getCollisions("player1");
   * ```
   */
  getCollisions(id: string): string[] {
    const set = this.collisions.get(id);
    return set ? Array.from(set) : [];
  }

  /**
   * ## Purpose
   *
   * Check whether two hitboxes are colliding.
   *
   * @example
   * ```ts
   * if (physic.areColliding("player1", "door")) {
   *   // open the door
   * }
   * ```
   */
  areColliding(id1: string, id2: string): boolean {
    const set = this.collisions.get(id1);
    return set ? set.has(id2) : false;
  }

  /**
   * ## Purpose
   *
   * Move a body according to the owner speed and the intended direction.
   *
   * ## Design
   *
   * Sets the linear velocity directly. Collision resolution is handled by the engine.
   *
   * @example
   * ```ts
   * physic.moveBody(player, Direction.Right);
   * ```
   */
  moveBody(player: RpgCommonPlayer, direction: Direction): boolean {
    const record = this.hitboxes.get(player.id);
    if (!record) return false;

    const speedValue = typeof player.speed === "function" ? player.speed() : 0;
    if (typeof (player as any).setIntendedDirection === "function") {
      (player as any).setIntendedDirection(direction);
    }

    let vx = 0;
    let vy = 0;

    switch (direction) {
      case Direction.Left:
        vx = -speedValue;
        break;
      case Direction.Right:
        vx = speedValue;
        break;
      case Direction.Up:
        vy = -speedValue;
        break;
      case Direction.Down:
        vy = speedValue;
        break;
    }

    record.entity.setVelocity({ x: vx, y: vy });
    record.entity.wakeUp();
    return true;
  }

  /**
   * ## Purpose
   *
   * Stop any movement for the provided player id.
   *
   * @example
   * ```ts
   * physic.stopMovement(player);
   * ```
   */
  stopMovement(player: RpgCommonPlayer): boolean {
    const record = this.hitboxes.get(player.id);
    if (!record) return false;

    if (typeof (player as any).setIntendedDirection === "function") {
      (player as any).setIntendedDirection(null);
    }

    record.entity.setVelocity({ x: 0, y: 0 });
    return true;
  }

  /**
   * ## Purpose
   *
   * Synchronise the physics body to match the owner's current coordinates.
   *
   * @example
   * ```ts
   * physic.syncPlayerToBody(player.id);
   * ```
   */
  syncPlayerToBody(playerId: string): boolean {
    const record = this.hitboxes.get(playerId);
    if (!record) return false;

    const owner = record.owner;
    if (!owner || typeof owner.x !== "function" || typeof owner.y !== "function") {
      return false;
    }

    const topLeftX = owner.x();
    const topLeftY = owner.y();
    const centerX = topLeftX + record.width / 2;
    const centerY = topLeftY + record.height / 2;
    record.entity.position.set(centerX, centerY);

    const state = this.movementStates.get(playerId);
    if (state) {
      state.lastPosition.set(centerX, centerY);
    }
    return true;
  }

  /**
   * ## Purpose
   *
   * Retrieve the underlying physics entity for integrations such as the movement manager.
   *
   * @example
   * ```ts
   * const entity = physic.getBody("player1");
   * ```
   */
  getBody(id: string): Entity | undefined {
    return this.hitboxes.get(id)?.entity;
  }

  /**
   * ## Purpose
   *
   * Apply a translation (delta) to a body.
   *
   * @example
   * ```ts
   * physic.applyTranslation("player1", 10, 0);
   * ```
   */
  applyTranslation(id: string, dx: number, dy: number): boolean {
    const record = this.hitboxes.get(id);
    if (!record) return false;

    record.entity.position.addInPlace(new Vector2(dx, dy));
    record.entity.wakeUp();
    return true;
  }

  /**
   * ## Purpose
   *
   * Override the velocity of a body.
   *
   * @example
   * ```ts
   * physic.setVelocity("player1", 5, 0);
   * ```
   */
  setVelocity(id: string, vx: number, vy: number): boolean {
    const record = this.hitboxes.get(id);
    if (!record) return false;
    record.entity.setVelocity({ x: vx, y: vy });
    record.entity.wakeUp();
    return true;
  }

  /**
   * ## Purpose
   *
   * Declare whether a body should behave as static.
   *
   * @example
   * ```ts
   * physic.setBodyStatic("event1", true);
   * ```
   */
  setBodyStatic(id: string, isStatic: boolean): boolean {
    const record = this.hitboxes.get(id);
    if (!record) return false;

    record.isStatic = isStatic;
    if (isStatic) {
      record.entity.mass = Infinity;
      record.entity.invMass = 0;
      record.entity.freeze();
    } else {
      record.entity.mass = 1;
      record.entity.invMass = 1;
      record.entity.unfreeze();
    }
    return true;
  }

  /**
   * ## Purpose
   *
   * Register movement start/stop observers.
   *
   * @example
   * ```ts
   * physic.registerMovementEvents("npc", () => console.log("start"), () => console.log("stop"));
   * ```
   */
  registerMovementEvents(
    id: string,
    onStartMoving?: () => void,
    onStopMoving?: () => void,
  ): boolean {
    const record = this.hitboxes.get(id);
    if (!record) return false;

    let state = this.movementStates.get(id);
    if (!state) {
      state = {
        isMoving: false,
        lastPosition: record.entity.position.clone(),
      };
      this.movementStates.set(id, state);
    }

    state.onStartMoving = onStartMoving;
    state.onStopMoving = onStopMoving;
    return true;
  }

  /**
   * ## Purpose
   *
   * Determine whether an entity is considered moving.
   *
   * @example
   * ```ts
   * if (physic.isMoving("player1")) {
   *   player.animationName.set("walk");
   * }
   * ```
   */
  isMoving(id: string): boolean {
    const state = this.movementStates.get(id);
    return state ? state.isMoving : false;
  }

  /**
   * ## Purpose
   *
   * Create an analytical zone used to detect nearby entities.
   *
   * @example
   * ```ts
   * physic.addZone("vision", { linkedTo: "guard", radius: 80, angle: 120 });
   * ```
   */
  addZone(id: string, options: ZoneOptions): string {
    if (this.zones.has(id) || this.hitboxes.has(id)) {
      throw new Error(`Zone with id ${id} already exists`);
    }

    const radius = options.radius;
    if (typeof radius !== "number" || radius <= 0) {
      throw new Error("Zone radius must be a positive number");
    }

    const angle = options.angle ?? 360;
    const direction = options.direction ?? Direction.Down;

    let position: Vector2;
    let type: "static" | "linked" = "static";
    let linkedTo: string | undefined;

    if (options.linkedTo) {
      const host = this.hitboxes.get(options.linkedTo);
      if (!host) {
        throw new Error(`Cannot link zone to unknown hitbox ${options.linkedTo}`);
      }

      type = "linked";
      linkedTo = options.linkedTo;
      position = host.entity.position.clone();
    } else {
      if (typeof options.x !== "number" || typeof options.y !== "number") {
        throw new Error("Static zones require x and y coordinates");
      }
      position = new Vector2(options.x, options.y);
    }

    const record: ZoneRecord = {
      id,
      type,
      body: {
        position,
        radius,
        angle,
        direction,
      },
      linkedTo,
      limitedByWalls: !!options.limitedByWalls,
      inside: new Set(),
    };

    this.zones.set(id, record);
    return id;
  }

  /**
   * ## Purpose
   *
   * Remove a zone and all its observers.
   *
   * @example
   * ```ts
   * physic.removeZone("vision");
   * ```
   */
  removeZone(id: string): boolean {
    return this.zones.delete(id);
  }

  /**
   * ## Purpose
   *
   * Retrieve the zone descriptor for inspection.
   *
   * @example
   * ```ts
   * const zone = physic.getZone("vision");
   * ```
   */
  getZone(id: string): ZoneRecord | undefined {
    return this.zones.get(id);
  }

  /**
   * ## Purpose
   *
   * Subscribe to zone enter/exit events.
   *
   * @example
   * ```ts
   * physic.registerZoneEvents("vision", enter => console.log(enter));
   * ```
   */
  registerZoneEvents(
    id: string,
    onEnter?: (hitIds: string[]) => void,
    onExit?: (hitIds: string[]) => void,
  ): boolean {
    const zone = this.zones.get(id);
    if (!zone) return false;
    zone.onEnter = onEnter;
    zone.onExit = onExit;
    return true;
  }

  /**
   * ## Purpose
   *
   * Return the identifiers of entities currently inside the zone.
   *
   * @example
   * ```ts
   * const inside = physic.getEntitiesInZone("vision");
   * ```
   */
  getEntitiesInZone(id: string): string[] {
    const zone = this.zones.get(id);
    if (!zone) return [];
    return Array.from(zone.inside);
  }

  /**
   * ## Purpose
   *
   * Integrate the physics simulation by the given delta in milliseconds.
   *
   * ## Design
   *
   * Accumulates fractional steps to honour the fixed time step, then
   * synchronises world entities, movement states and zones.
   *
   * @example
   * ```ts
   * physic.update(16);
   * ```
   */
  update(deltaMs: number): void {
    this.accumulator += deltaMs;

    while (this.accumulator >= this.fixedStepMs) {
      this.engine.step();
      this.accumulator -= this.fixedStepMs;
    }

    this.syncOwners();
    this.updateMovementStates();
    this.updateZones();
  }

  /**
   * ## Purpose
   *
   * Expose the underlying world for advanced integrations.
   *
   * @example
   * ```ts
   * const world = physic.getWorld();
   * ```
   */
  getWorld() {
    return this.engine.getWorld();
  }

  /**
   * ## Purpose
   *
   * Retrieve the engine instance.
   *
   * @example
   * ```ts
   * const engine = physic.getEngine();
   * ```
   */
  getEngine(): PhysicsEngine {
    return this.engine;
  }

  /**
   * ## Purpose
   *
   * Preserve the legacy sliding API by storing options for later use.
   * The current backend does not yet implement custom sliding, but
   * keeping the data ensures forward compatibility.
   *
   * @example
   * ```ts
   * physic.setSliding("player1", true, { friction: 0.2 });
   * ```
   */
  setSliding(id: string, enabled: boolean, options?: SlidingOptions): boolean {
    if (!this.hitboxes.has(id)) return false;
    this.slidingStates.set(id, { enabled, options });
    return true;
  }

  /**
   * @example
   * ```ts
   * const enabled = physic.isSlidingEnabled("player1");
   * ```
   */
  isSlidingEnabled(id: string): boolean {
    return this.slidingStates.get(id)?.enabled ?? false;
  }

  /**
   * @example
   * ```ts
   * const options = physic.getSlidingOptions("player1");
   * ```
   */
  getSlidingOptions(id: string): SlidingOptions | undefined {
    return this.slidingStates.get(id)?.options;
  }

  private createSnapshot(record: HitboxRecord): PhysicsBodySnapshot {
    const centerX = record.entity.position.x;
    const centerY = record.entity.position.y;
    const topLeftX = centerX - record.width / 2;
    const topLeftY = centerY - record.height / 2;

    return {
      id: record.id,
      center: { x: centerX, y: centerY },
      topLeft: { x: topLeftX, y: topLeftY },
      velocity: {
        x: record.entity.velocity.x,
        y: record.entity.velocity.y,
      },
      width: record.width,
      height: record.height,
    };
  }

  private syncOwners(): void {
    for (const record of this.hitboxes.values()) {
      if (!record.owner) continue;
      const snapshot = this.createSnapshot(record);
      const owner = record.owner;

      if (typeof owner.x === "function" && typeof owner.x.set === "function") {
        const current = Math.round(owner.x());
        const next = Math.round(snapshot.topLeft.x);
        if (current !== next) {
          owner.x.set(next);
        }
      }

      if (typeof owner.y === "function" && typeof owner.y.set === "function") {
        const current = Math.round(owner.y());
        const next = Math.round(snapshot.topLeft.y);
        if (current !== next) {
          owner.y.set(next);
        }
      }

      if (typeof owner.applyPhysic === "function") {
        owner.applyPhysic(snapshot);
      }
    }
  }

  private updateMovementStates(): void {
    for (const [id, state] of this.movementStates.entries()) {
      const record = this.hitboxes.get(id);
      if (!record) continue;

      const current = record.entity.position;
      const dx = current.x - state.lastPosition.x;
      const dy = current.y - state.lastPosition.y;
      const distance = Math.hypot(dx, dy);
      const speed = record.entity.velocity.length();
      const moving = distance > MOVEMENT_DISTANCE_EPSILON || speed > VELOCITY_EPSILON;

      if (moving && !state.isMoving) {
        state.isMoving = true;
        state.onStartMoving?.();
      } else if (!moving && state.isMoving) {
        state.isMoving = false;
        state.onStopMoving?.();
      }

      state.lastPosition.set(current.x, current.y);
    }
  }

  private updateZones(): void {
    for (const zone of this.zones.values()) {
      if (zone.type === "linked" && zone.linkedTo) {
        const host = this.hitboxes.get(zone.linkedTo);
        if (host) {
          zone.body.position.copyFrom(host.entity.position);
          const owner = host.owner;
          if (owner) {
            const dir =
              typeof owner.direction === "function"
                ? owner.direction()
                : owner.direction ?? zone.body.direction;
            if (dir !== undefined) {
              zone.body.direction = dir;
            }
          }
        }
      }

      const hits = new Set<string>();
      for (const [id, record] of this.hitboxes.entries()) {
        if (id === zone.linkedTo) continue;
        if (this.isEntityInsideZone(zone, record)) {
          hits.add(id);
        }
      }

      const previous = zone.inside;

      const entered: string[] = [];
      for (const id of hits) {
        if (!previous.has(id)) {
          entered.push(id);
        }
      }

      const exited: string[] = [];
      for (const id of previous) {
        if (!hits.has(id)) {
          exited.push(id);
        }
      }

      if (entered.length > 0) {
        zone.onEnter?.(entered);
      }
      if (exited.length > 0) {
        zone.onExit?.(exited);
      }

      zone.inside = hits;
    }
  }

  private isEntityInsideZone(zone: ZoneRecord, record: HitboxRecord): boolean {
    const zonePos = zone.body.position;
    const entityPos = record.entity.position;
    const dx = entityPos.x - zonePos.x;
    const dy = entityPos.y - zonePos.y;
    const distance = Math.hypot(dx, dy);
    const entityRadius = Math.max(record.width, record.height) / 2;

    if (distance - entityRadius > zone.body.radius) {
      return false;
    }

    if (zone.body.angle < 360) {
      const facing = directionToAngle(zone.body.direction);
      const angle = Math.atan2(dy, dx);
      const delta = normalizeAngle(angle - facing);
      const halfAperture = (zone.body.angle * Math.PI) / 360;
      if (Math.abs(delta) > halfAperture) {
        return false;
      }
    }

    if (zone.limitedByWalls && !this.hasLineOfSight(zonePos, entityPos, record.id)) {
      return false;
    }

    return true;
  }

  private hasLineOfSight(start: Vector2, end: Vector2, ignoreId?: string): boolean {
    for (const record of this.hitboxes.values()) {
      if (!record.isStatic) continue;
      if (record.id === ignoreId) continue;

      const bounds = this.getBounds(record);
      if (this.lineIntersectsRect(start, end, bounds)) {
        return false;
      }
    }
    return true;
  }

  private getBounds(record: HitboxRecord): RectBounds {
    const centerX = record.entity.position.x;
    const centerY = record.entity.position.y;
    const halfW = record.width / 2;
    const halfH = record.height / 2;
    return {
      minX: centerX - halfW,
      maxX: centerX + halfW,
      minY: centerY - halfH,
      maxY: centerY + halfH,
    };
  }

  private lineIntersectsRect(
    start: Vector2,
    end: Vector2,
    rect: RectBounds,
  ): boolean {
    const insideStart =
      start.x >= rect.minX &&
      start.x <= rect.maxX &&
      start.y >= rect.minY &&
      start.y <= rect.maxY;
    const insideEnd =
      end.x >= rect.minX &&
      end.x <= rect.maxX &&
      end.y >= rect.minY &&
      end.y <= rect.maxY;

    if (insideStart && insideEnd) {
      return false;
    }

    const corners = [
      new Vector2(rect.minX, rect.minY),
      new Vector2(rect.maxX, rect.minY),
      new Vector2(rect.maxX, rect.maxY),
      new Vector2(rect.minX, rect.maxY),
    ];

    const edges: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ];

    for (const [a, b] of edges) {
      if (this.segmentsIntersect(start, end, corners[a], corners[b])) {
        return true;
      }
    }

    return false;
  }

  private segmentsIntersect(
    p1: Vector2,
    p2: Vector2,
    p3: Vector2,
    p4: Vector2,
  ): boolean {
    const o1 = this.orientation(p1, p2, p3);
    const o2 = this.orientation(p1, p2, p4);
    const o3 = this.orientation(p3, p4, p1);
    const o4 = this.orientation(p3, p4, p2);

    if (o1 !== o2 && o3 !== o4) {
      return true;
    }

    if (o1 === 0 && this.onSegment(p1, p3, p2)) return true;
    if (o2 === 0 && this.onSegment(p1, p4, p2)) return true;
    if (o3 === 0 && this.onSegment(p3, p1, p4)) return true;
    if (o4 === 0 && this.onSegment(p3, p2, p4)) return true;

    return false;
  }

  private orientation(a: Vector2, b: Vector2, c: Vector2): number {
    const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
    if (value === 0) return 0;
    return value > 0 ? 1 : 2;
  }

  private onSegment(a: Vector2, b: Vector2, c: Vector2): boolean {
    return (
      b.x <= Math.max(a.x, c.x) &&
      b.x >= Math.min(a.x, c.x) &&
      b.y <= Math.max(a.y, c.y) &&
      b.y >= Math.min(a.y, c.y)
    );
  }

  private onCollisionEnter(collision: CollisionInfo): void {
    const idA = collision.entityA.uuid;
    const idB = collision.entityB.uuid;
    if (!this.hitboxes.has(idA) || !this.hitboxes.has(idB)) {
      return;
    }

    this.recordCollision(idA, idB);
    this.recordCollision(idB, idA);

    this.collisionCallbacks.get(idA)?.onCollisionEnter?.([idB]);
    this.collisionCallbacks.get(idB)?.onCollisionEnter?.([idA]);
  }

  private onCollisionExit(collision: CollisionInfo): void {
    const idA = collision.entityA.uuid;
    const idB = collision.entityB.uuid;
    if (!this.hitboxes.has(idA) || !this.hitboxes.has(idB)) {
      return;
    }

    this.removeCollision(idA, idB);
    this.removeCollision(idB, idA);

    this.collisionCallbacks.get(idA)?.onCollisionExit?.([idB]);
    this.collisionCallbacks.get(idB)?.onCollisionExit?.([idA]);
  }

  private recordCollision(source: string, target: string): void {
    let set = this.collisions.get(source);
    if (!set) {
      set = new Set();
      this.collisions.set(source, set);
    }
    set.add(target);
  }

  private removeCollision(source: string, target: string): void {
    const set = this.collisions.get(source);
    if (set) {
      set.delete(target);
    }
  }
}