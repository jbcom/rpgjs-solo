import { PhysicsEngine } from './PhysicsEngine';
import { Entity } from '../physics/Entity';
import { Vector2 } from '../core/math/Vector2';
import { AABB } from '../core/math/AABB';
import { generateUUID } from '../utils/uuid';

/**
 * Direction value for zone orientation (used for cone-shaped zones)
 */
export type ZoneDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Configuration for a static zone (fixed position in the world)
 */
export interface StaticZoneConfig {
  /** Zone position in world coordinates */
  position: Vector2 | { x: number; y: number };
  /** Zone radius */
  radius: number;
  /** Cone angle in degrees (360 = full circle, < 360 = cone) */
  angle?: number;
  /** Direction for cone-shaped zones */
  direction?: ZoneDirection;
  /** Whether line-of-sight is required (blocks through static entities) */
  limitedByWalls?: boolean;
  /** Optional metadata */
  metadata?: Record<string, any>;
}

/**
 * Configuration for a zone attached to an entity
 */
export interface AttachedZoneConfig {
  /** Entity to attach the zone to */
  entity: Entity;
  /** Offset from entity position (default: {x: 0, y: 0}) */
  offset?: Vector2 | { x: number; y: number };
  /** Zone radius */
  radius: number;
  /** Cone angle in degrees (360 = full circle, < 360 = cone) */
  angle?: number;
  /** Direction for cone-shaped zones (can be relative to entity rotation or fixed) */
  direction?: ZoneDirection;
  /** Whether line-of-sight is required (blocks through static entities) */
  limitedByWalls?: boolean;
  /** Optional metadata */
  metadata?: Record<string, any>;
}

/**
 * Union type for zone configuration
 */
export type ZoneConfig = StaticZoneConfig | AttachedZoneConfig;

/**
 * Zone event callbacks
 */
export interface ZoneCallbacks {
  /**
   * Called when entities enter the zone
   * @param entities - Array of entities that entered
   */
  onEnter?: (entities: Entity[]) => void;
  /**
   * Called when entities exit the zone
   * @param entities - Array of entities that exited
   */
  onExit?: (entities: Entity[]) => void;
}

/**
 * Public zone information
 */
export interface ZoneInfo {
  id: string;
  type: 'static' | 'attached';
  position: Vector2;
  radius: number;
  angle: number;
  direction: ZoneDirection;
  limitedByWalls: boolean;
  metadata?: Record<string, any> | undefined;
}

/**
 * Internal zone record
 */
interface ZoneRecord extends ZoneInfo {
  attachedEntity?: Entity | undefined;
  offset?: Vector2 | undefined;
  callbacks?: ZoneCallbacks | undefined;
  inside: Set<string>; // Set of entity UUIDs currently inside
}

/**
 * Zone manager for detecting entities within circular/cone-shaped areas.
 *
 * Zones can be used for vision, skill ranges, explosions, and other gameplay mechanics
 * that need to detect entities without physical collisions.
 *
 * @example
 * ```typescript
 * const engine = new PhysicsEngine({ timeStep: 1/60 });
 * const zones = new ZoneManager(engine);
 *
 * // Create a static zone
 * const zoneId = zones.createZone({
 *   position: { x: 100, y: 100 },
 *   radius: 50,
 *   onEnter: (entities) => console.log('Entities entered:', entities),
 * });
 *
 * // Create a zone attached to an entity
 * const player = engine.createEntity({ position: { x: 0, y: 0 }, radius: 10 });
 * const visionZone = zones.createAttachedZone(player, {
 *   radius: 100,
 *   angle: 90,
 *   direction: 'right',
 *   onEnter: (entities) => console.log('Player sees:', entities),
 * });
 *
 * // Update zones after each physics step
 * engine.step();
 * zones.update();
 * ```
 */
export class ZoneManager {
  private readonly engine: PhysicsEngine;
  private readonly zones = new Map<string, ZoneRecord>();

  /**
   * Creates a new zone manager
   *
   * @param engine - Physics engine instance
   */
  constructor(engine: PhysicsEngine) {
    this.engine = engine;
  }

  /**
   * Creates a new zone
   *
   * @param config - Zone configuration
   * @param callbacks - Optional event callbacks
   * @returns Zone identifier
   *
   * @example
   * ```typescript
   * const zoneId = zones.createZone({
   *   position: { x: 100, y: 100 },
   *   radius: 50,
   *   angle: 180,
   *   direction: 'right',
   * }, {
   *   onEnter: (entities) => console.log('Entered:', entities),
   *   onExit: (entities) => console.log('Exited:', entities),
   * });
   * ```
   */
  createZone(
    config: ZoneConfig,
    callbacks?: ZoneCallbacks,
  ): string {
    const id = generateUUID();
    const radius = config.radius;
    if (typeof radius !== 'number' || radius <= 0) {
      throw new Error('Zone radius must be a positive number');
    }

    const angle = config.angle ?? 360;
    const direction = config.direction ?? 'down';
    const limitedByWalls = config.limitedByWalls ?? false;

    let position: Vector2;
    let type: 'static' | 'attached';
    let attachedEntity: Entity | undefined;
    let offset: Vector2 | undefined;

    if ('entity' in config) {
      // Attached zone
      type = 'attached';
      attachedEntity = config.entity;
      const entityPos = attachedEntity.position;
      const offsetValue = config.offset ?? { x: 0, y: 0 };
      if (offsetValue instanceof Vector2) {
        offset = offsetValue.clone();
      } else {
        offset = new Vector2(offsetValue.x, offsetValue.y);
      }
      position = new Vector2(entityPos.x + offset.x, entityPos.y + offset.y);
    } else {
      // Static zone
      type = 'static';
      const pos = config.position;
      if (pos instanceof Vector2) {
        position = pos.clone();
      } else {
        position = new Vector2(pos.x, pos.y);
      }
    }

    const record: ZoneRecord = {
      id,
      type,
      position,
      radius,
      angle,
      direction,
      limitedByWalls,
      metadata: config.metadata,
      attachedEntity,
      offset,
      callbacks,
      inside: new Set(),
    };

    this.zones.set(id, record);
    return id;
  }

  /**
   * Creates a zone attached to an entity (convenience method)
   *
   * @param entity - Entity to attach the zone to
   * @param config - Zone configuration
   * @param callbacks - Optional event callbacks
   * @returns Zone identifier
   *
   * @example
   * ```typescript
   * const visionZone = zones.createAttachedZone(player, {
   *   radius: 100,
   *   angle: 90,
   *   direction: 'right',
   *   offset: { x: 0, y: -10 },
   * }, {
   *   onEnter: (entities) => console.log('Player sees:', entities),
   * });
   * ```
   */
  createAttachedZone(
    entity: Entity,
    config: Omit<AttachedZoneConfig, 'entity'>,
    callbacks?: ZoneCallbacks,
  ): string {
    return this.createZone({ ...config, entity }, callbacks);
  }

  /**
   * Updates a zone's configuration
   *
   * @param id - Zone identifier
   * @param updates - Partial configuration updates
   * @returns True if the zone was found and updated
   *
   * @example
   * ```typescript
   * zones.updateZone(zoneId, { radius: 75, angle: 120 });
   * ```
   */
  updateZone(id: string, updates: Partial<ZoneConfig>): boolean {
    const zone = this.zones.get(id);
    if (!zone) return false;

    if (updates.radius !== undefined) {
      if (typeof updates.radius !== 'number' || updates.radius <= 0) {
        throw new Error('Zone radius must be a positive number');
      }
      zone.radius = updates.radius;
    }

    if (updates.angle !== undefined) {
      zone.angle = updates.angle;
    }

    if (updates.direction !== undefined) {
      zone.direction = updates.direction;
    }

    if (updates.limitedByWalls !== undefined) {
      zone.limitedByWalls = updates.limitedByWalls;
    }

    if (updates.metadata !== undefined) {
      zone.metadata = updates.metadata;
    }

    if ('offset' in updates && updates.offset !== undefined && zone.type === 'attached') {
      const offsetValue = updates.offset;
      if (offsetValue instanceof Vector2) {
        zone.offset = offsetValue.clone();
      } else {
        zone.offset = new Vector2(offsetValue.x, offsetValue.y);
      }
    }

    return true;
  }

  /**
   * Registers or updates callbacks for a zone
   *
   * @param id - Zone identifier
   * @param callbacks - Event callbacks
   * @returns True if the zone was found
   *
   * @example
   * ```typescript
   * zones.registerCallbacks(zoneId, {
   *   onEnter: (entities) => console.log('Entered:', entities),
   *   onExit: (entities) => console.log('Exited:', entities),
   * });
   * ```
   */
  registerCallbacks(id: string, callbacks: ZoneCallbacks): boolean {
    const zone = this.zones.get(id);
    if (!zone) return false;
    zone.callbacks = callbacks;
    return true;
  }

  /**
   * Removes a zone
   *
   * @param id - Zone identifier
   * @returns True if the zone was found and removed
   */
  removeZone(id: string): boolean {
    return this.zones.delete(id);
  }

  /**
   * Gets zone information
   *
   * @param id - Zone identifier
   * @returns Zone information or undefined
   */
  getZone(id: string): ZoneInfo | undefined {
    const zone = this.zones.get(id);
    if (!zone) return undefined;

    return {
      id: zone.id,
      type: zone.type,
      position: zone.position.clone(),
      radius: zone.radius,
      angle: zone.angle,
      direction: zone.direction,
      limitedByWalls: zone.limitedByWalls,
      metadata: zone.metadata,
    };
  }

  /**
   * Gets all entities currently inside a zone
   *
   * @param id - Zone identifier
   * @returns Array of entities inside the zone
   */
  getEntitiesInZone(id: string): Entity[] {
    const zone = this.zones.get(id);
    if (!zone) return [];

    const entities: Entity[] = [];
    for (const uuid of zone.inside) {
      const entity = this.engine.getEntityByUUID(uuid);
      if (entity) {
        entities.push(entity);
      }
    }
    return entities;
  }

  /**
   * Gets all zone identifiers
   *
   * @returns Array of zone IDs
   */
  getAllZoneIds(): string[] {
    return Array.from(this.zones.keys());
  }

  /**
   * Clears all zones
   */
  clear(): void {
    this.zones.clear();
  }

  /**
   * Updates all zones, detecting entities entering/exiting
   *
   * This should be called after each physics step to keep zones synchronized.
   *
   * @param _deltaTime - Optional delta time (not used currently, but kept for future use)
   *
   * @example
   * ```typescript
   * engine.step();
   * zones.update();
   * ```
   */
  update(_deltaTime?: number): void {
    for (const zone of this.zones.values()) {
      // Update position for attached zones
      if (zone.type === 'attached' && zone.attachedEntity) {
        const entityPos = zone.attachedEntity.position;
        const offset = zone.offset ?? new Vector2(0, 0);
        zone.position.set(entityPos.x + offset.x, entityPos.y + offset.y);
      }

      // Query entities in the zone's AABB (broad phase)
      const aabb = new AABB(
        zone.position.x - zone.radius,
        zone.position.y - zone.radius,
        zone.position.x + zone.radius,
        zone.position.y + zone.radius,
      );
      const candidates = this.engine.queryAABB(aabb);

      // Filter entities that are actually inside the zone (narrow phase)
      const hits = new Set<string>();
      for (const entity of candidates) {
        // Skip the attached entity itself
        if (zone.attachedEntity && entity.uuid === zone.attachedEntity.uuid) {
          continue;
        }

        if (this.isEntityInsideZone(zone, entity)) {
          hits.add(entity.uuid);
        }
      }

      // Detect enter/exit events
      const previous = zone.inside;
      const entered: Entity[] = [];
      const exited: Entity[] = [];

      for (const uuid of hits) {
        if (!previous.has(uuid)) {
          const entity = this.engine.getEntityByUUID(uuid);
          if (entity) {
            entered.push(entity);
          }
        }
      }

      for (const uuid of previous) {
        if (!hits.has(uuid)) {
          const entity = this.engine.getEntityByUUID(uuid);
          if (entity) {
            exited.push(entity);
          }
        }
      }

      // Update zone state
      zone.inside = hits;

      // Trigger callbacks
      if (entered.length > 0 && zone.callbacks?.onEnter) {
        zone.callbacks.onEnter(entered);
      }
      if (exited.length > 0 && zone.callbacks?.onExit) {
        zone.callbacks.onExit(exited);
      }
    }
  }

  /**
   * Checks if an entity is inside a zone
   *
   * @param zone - Zone record
   * @param entity - Entity to check
   * @returns True if the entity is inside the zone
   */
  private isEntityInsideZone(zone: ZoneRecord, entity: Entity): boolean {
    const zonePos = zone.position;
    const entityPos = entity.position;

    // Calculate distance from zone center to entity center
    const dx = entityPos.x - zonePos.x;
    const dy = entityPos.y - zonePos.y;
    const distance = Math.hypot(dx, dy);

    // Get entity radius (use max of width/height for AABB, or radius for circle)
    const entityRadius = entity.radius > 0
      ? entity.radius
      : Math.max(entity.width, entity.height) / 2;

    // Check if entity is within radius
    if (distance - entityRadius > zone.radius) {
      return false;
    }

    // Check cone angle if zone is not a full circle
    if (zone.angle < 360) {
      const facing = this.directionToAngle(zone.direction);
      const angle = Math.atan2(dy, dx);
      const delta = this.normalizeAngle(angle - facing);
      const halfAperture = (zone.angle * Math.PI) / 360;
      if (Math.abs(delta) > halfAperture) {
        return false;
      }
    }

    // Check line-of-sight if required
    if (zone.limitedByWalls) {
      if (!this.hasLineOfSight(zonePos, entityPos, entity.uuid)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Checks if there's a clear line of sight between two points
   *
   * @param start - Start position
   * @param end - End position
   * @param ignoreEntityId - Entity UUID to ignore (usually the target entity)
   * @returns True if line of sight is clear
   */
  private hasLineOfSight(
    start: Vector2,
    end: Vector2,
    ignoreEntityId?: string,
  ): boolean {
    const direction = end.sub(start);
    const distance = direction.length();

    if (distance < 1e-5) return true;

    direction.normalizeInPlace();

    // Use raycast for efficient line-of-sight check
    // We want to find if there is ANY static entity between start and end
    const hit = this.engine.raycast(start, direction, distance, undefined, (entity) => {
      // Ignore dynamic entities (unless we want them to block vision?)
      // For now, only static entities block vision as per original logic
      if (!entity.isStatic()) return false;

      // Ignore specific entity (e.g. the target itself)
      if (ignoreEntityId && entity.uuid === ignoreEntityId) return false;

      return true;
    });

    return hit === null;
  }

  /**
   * Converts direction string to angle in radians
   *
   * @param dir - Direction
   * @returns Angle in radians
   */
  private directionToAngle(dir: ZoneDirection): number {
    switch (dir) {
      case 'up':
        return -Math.PI / 2;
      case 'down':
        return Math.PI / 2;
      case 'left':
        return Math.PI;
      case 'right':
      default:
        return 0;
    }
  }

  /**
   * Normalizes angle to [-π, π]
   *
   * @param angle - Angle in radians
   * @returns Normalized angle
   */
  private normalizeAngle(angle: number): number {
    let a = angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
}

