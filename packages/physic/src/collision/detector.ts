import { Entity } from '../physics/Entity';
import { Collider, CollisionInfo } from './Collider';
import { CircleCollider } from './CircleCollider';
import { AABBCollider } from './AABBCollider';
import { PolygonCollider, entityToPolygonConfig } from './PolygonCollider';
import { CapsuleCollider } from './CapsuleCollider';
import { getCachedCollider, setCachedCollider } from './collider-cache';

/**
 * Collision detector
 * 
 * Handles collision detection between entities using their colliders.
 * Supports efficient broad-phase and narrow-phase detection.
 */

/**
 * Creates a collider for an entity based on its shape
 * 
 * @param entity - Entity to create collider for
 * @returns Appropriate collider instance
 */
export function createCollider(entity: Entity): Collider | null {
  const cached = getCachedCollider(entity);
  if (cached) {
    return cached;
  }
  let collider: Collider | null = null;
  // 1) Explicit polygon assignment has priority
  if (entityToPolygonConfig.has(entity)) {
    collider = new PolygonCollider(entity);
  } else if (entity.capsule) {
    collider = new CapsuleCollider(entity);
  } else if (entity.radius > 0) {
    collider = new CircleCollider(entity);
  } else if (entity.width > 0 && entity.height > 0) {
    collider = new AABBCollider(entity);
  }
  if (collider) {
    setCachedCollider(entity, collider);
  }
  return collider;
}

/**
 * Tests collision between two entities
 * 
 * @param entityA - First entity
 * @param entityB - Second entity
 * @returns Collision info if collision detected, null otherwise
 */
export function testCollision(entityA: Entity, entityB: Entity): CollisionInfo | null {
  // Check collision masks
  if (!entityA.canCollideWith(entityB)) {
    return null;
  }

  // Skip static-static collisions
  if (entityA.isStatic() && entityB.isStatic()) {
    return null;
  }

  const colliderA = createCollider(entityA);
  const colliderB = createCollider(entityB);

  if (!colliderA || !colliderB) {
    return null;
  }

  return colliderA.testCollision(colliderB);
}

/**
 * Finds all collisions between entities
 * 
 * @param entities - Array of entities to test
 * @returns Array of collision infos
 */
export function findCollisions(entities: Entity[]): CollisionInfo[] {
  const collisions: CollisionInfo[] = [];

  for (let i = 0; i < entities.length; i++) {
    const entityA = entities[i];
    if (!entityA) continue;

    for (let j = i + 1; j < entities.length; j++) {
      const entityB = entities[j];
      if (!entityB) continue;

      const collision = testCollision(entityA, entityB);
      if (collision) {
        collisions.push(collision);
      }
    }
  }

  return collisions;
}
