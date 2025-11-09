import { Vector2 } from '../core/math/Vector2';
import { Entity } from './Entity';

/**
 * Force system for applying various types of forces to entities
 * 
 * Provides utilities for common force patterns in top-down physics.
 */

/**
 * Applies a constant force (e.g., wind, magnetic field)
 * 
 * @param entity - Entity to apply force to
 * @param force - Force vector
 * 
 * @example
 * ```typescript
 * applyConstantForce(entity, new Vector2(5, 0)); // Wind pushing right
 * ```
 */
export function applyConstantForce(entity: Entity, force: Vector2): void {
  entity.applyForce(force);
}

/**
 * Applies an attraction force towards a point
 * 
 * @param entity - Entity to apply force to
 * @param target - Target point
 * @param strength - Force strength
 * @param maxDistance - Maximum distance for force application (optional)
 * 
 * @example
 * ```typescript
 * applyAttraction(entity, new Vector2(0, 0), 10); // Attract to origin
 * ```
 */
export function applyAttraction(
  entity: Entity,
  target: Vector2,
  strength: number,
  maxDistance?: number
): void {
  const direction = target.sub(entity.position);
  const distance = direction.length();
  
  if (maxDistance !== undefined && distance > maxDistance) {
    return;
  }
  
  if (distance < 0.001) {
    return; // Too close, avoid division by zero
  }
  
  direction.normalizeInPlace();
  const force = direction.mul(strength);
  entity.applyForce(force);
}

/**
 * Applies a repulsion force from a point
 * 
 * @param entity - Entity to apply force to
 * @param source - Source point to repel from
 * @param strength - Force strength
 * @param maxDistance - Maximum distance for force application (optional)
 * 
 * @example
 * ```typescript
 * applyRepulsion(entity, new Vector2(0, 0), 10); // Repel from origin
 * ```
 */
export function applyRepulsion(
  entity: Entity,
  source: Vector2,
  strength: number,
  maxDistance?: number
): void {
  const direction = entity.position.sub(source);
  const distance = direction.length();
  
  if (maxDistance !== undefined && distance > maxDistance) {
    return;
  }
  
  if (distance < 0.001) {
    return; // Too close, avoid division by zero
  }
  
  direction.normalizeInPlace();
  const force = direction.mul(strength);
  entity.applyForce(force);
}

/**
 * Applies a directional force field
 * 
 * @param entity - Entity to apply force to
 * @param direction - Direction of the force field
 * @param strength - Force strength
 * 
 * @example
 * ```typescript
 * applyDirectionalForce(entity, new Vector2(1, 0), 5); // Push right
 * ```
 */
export function applyDirectionalForce(
  entity: Entity,
  direction: Vector2,
  strength: number
): void {
  const normalized = direction.normalize();
  const force = normalized.mul(strength);
  entity.applyForce(force);
}

/**
 * Applies an explosion force (radial impulse)
 * 
 * @param entity - Entity to apply force to
 * @param center - Explosion center
 * @param strength - Explosion strength
 * @param radius - Explosion radius
 * @param falloff - Distance falloff factor (default: 1, linear)
 * 
 * @example
 * ```typescript
 * applyExplosion(entity, new Vector2(0, 0), 100, 50); // Explosion at origin
 * ```
 */
export function applyExplosion(
  entity: Entity,
  center: Vector2,
  strength: number,
  radius: number,
  falloff = 1
): void {
  const direction = entity.position.sub(center);
  const distance = direction.length();
  
  if (distance > radius || distance < 0.001) {
    return;
  }
  
  // Calculate force based on distance (inverse square or linear)
  const normalizedDistance = distance / radius;
  const forceStrength = strength * Math.pow(1 - normalizedDistance, falloff);
  
  direction.normalizeInPlace();
  const force = direction.mul(forceStrength);
  
  // Apply as impulse for immediate effect
  entity.applyImpulse(force);
}

/**
 * Applies a spring force between two entities
 * 
 * @param entityA - First entity
 * @param entityB - Second entity
 * @param restLength - Rest length of the spring
 * @param springConstant - Spring constant (stiffness)
 * @param damping - Damping coefficient
 * 
 * @example
 * ```typescript
 * applySpring(entity1, entity2, 10, 0.5, 0.1); // Spring between entities
 * ```
 */
export function applySpring(
  entityA: Entity,
  entityB: Entity,
  restLength: number,
  springConstant: number,
  damping: number
): void {
  const direction = entityB.position.sub(entityA.position);
  const distance = direction.length();
  
  if (distance < 0.001) {
    return; // Entities overlap, skip
  }
  
  // Spring force: F = -k * (x - x0)
  const displacement = distance - restLength;
  const springForce = springConstant * displacement;
  
  direction.normalizeInPlace();
  const force = direction.mul(springForce);
  
  // Apply forces (opposite directions)
  entityA.applyForce(force.mul(-1));
  entityB.applyForce(force);
  
  // Damping (relative velocity)
  if (damping > 0) {
    const relativeVelocity = entityB.velocity.sub(entityA.velocity);
    const dampingForce = direction.mul(-damping * relativeVelocity.dot(direction));
    entityA.applyForce(dampingForce.mul(-1));
    entityB.applyForce(dampingForce);
  }
}

