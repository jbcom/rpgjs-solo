import { Vector2 } from '../core/math/Vector2';
import { AABB } from '../core/math/AABB';
import { Entity } from '../physics/Entity';
import { Ray, RaycastHit } from './Ray';

/**
 * Contact point information
 */
export interface ContactPoint {
  /** Contact point position */
  point: Vector2;
  /** Normal vector pointing from A to B */
  normal: Vector2;
  /** Penetration depth */
  depth: number;
}

/**
 * Collision information
 */
export interface CollisionInfo {
  /** First entity */
  entityA: Entity;
  /** Second entity */
  entityB: Entity;
  /** Contact points */
  contacts: ContactPoint[];
  /** Collision normal (from A to B) */
  normal: Vector2;
  /** Penetration depth */
  depth: number;
}

/**
 * Abstract collider interface
 * 
 * All collider types must implement this interface.
 * Provides a pluggable architecture for custom collider shapes.
 * 
 * @example
 * ```typescript
 * class CustomCollider implements Collider {
 *   getBounds(): AABB { ... }
 *   testCollision(other: Collider): CollisionInfo | null { ... }
 *   getContactPoints(other: Collider): ContactPoint[] { ... }
 * }
 * ```
 */
export interface Collider {
  /**
   * Gets the axis-aligned bounding box of this collider
   * 
   * @returns AABB containing this collider
   */
  getBounds(): AABB;

  /**
   * Tests collision with another collider
   * 
   * @param other - Other collider to test against
   * @returns Collision information if collision detected, null otherwise
   */
  testCollision(other: Collider): CollisionInfo | null;

  /**
   * Gets contact points with another collider
   * 
   * @param other - Other collider
   * @returns Array of contact points
   */
  getContactPoints(other: Collider): ContactPoint[];

  /**
   * Gets the entity this collider belongs to
   * 
   * @returns Entity reference
   */
  getEntity(): Entity;

  /**
   * Casts a ray against this collider
   * 
   * @param ray - Ray to cast
   * @returns Raycast hit info if hit, null otherwise
   */
  raycast(ray: Ray): RaycastHit | null;
}

