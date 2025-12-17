import { Vector2 } from '../core/math/Vector2';
import { Entity } from '../physics/Entity';
import { CollisionInfo } from './Collider';

/**
 * Collision resolver configuration
 */
export interface ResolverConfig {
  /** Position correction factor (0-1, higher = more correction) */
  positionCorrectionFactor?: number;
  /** Minimum penetration depth to resolve */
  minPenetrationDepth?: number;
  /** Maximum position correction per step */
  maxPositionCorrection?: number;
}

/**
 * Collision resolver
 * 
 * Resolves collisions by separating entities and applying impulses.
 * Uses impulse-based resolution for stable, deterministic physics.
 * 
 * @example
 * ```typescript
 * const resolver = new CollisionResolver();
 * resolver.resolve(collision);
 * ```
 */
export class CollisionResolver {
  private config: Required<ResolverConfig>;

  /**
   * Creates a new collision resolver
   * 
   * @param config - Resolver configuration
   */
  constructor(config: ResolverConfig = {}) {
    this.config = {
      positionCorrectionFactor: config.positionCorrectionFactor ?? 0.8,
      minPenetrationDepth: config.minPenetrationDepth ?? 0.0001,
      maxPositionCorrection: config.maxPositionCorrection ?? 5,
    };
  }

  /**
   * Resolves a collision
   * 
   * Separates entities and applies collision response.
   * First checks if the collision should be resolved using resolution filters.
   * If any entity has a resolution filter that returns false, the collision
   * is skipped (entities pass through) but events are still fired.
   * 
   * @param collision - Collision information to resolve
   */
  public resolve(collision: CollisionInfo): void {
    const { entityA, entityB, normal, depth } = collision;

    // Skip if penetration is too small
    if (depth < this.config.minPenetrationDepth) {
      return;
    }

    // Check resolution filters - if either entity says no, skip resolution
    // This allows entities to pass through each other while still detecting collisions
    if (!entityA.shouldResolveCollisionWith(entityB)) {
      return;
    }

    // Position correction (separate entities)
    this.separateEntities(entityA, entityB, normal, depth);

    // Velocity resolution (collision response)
    this.resolveVelocities(entityA, entityB, normal);
  }

  /**
   * Separates two entities by moving them apart
   * 
   * This method applies position corrections to resolve penetration between
   * colliding entities. After applying corrections, it notifies position change
   * handlers to ensure proper synchronization with game logic (e.g., updating
   * owner.x/y signals for network sync).
   * 
   * @param entityA - First entity
   * @param entityB - Second entity
   * @param normal - Separation normal (from A to B)
   * @param depth - Penetration depth
   */
  private separateEntities(
    entityA: Entity,
    entityB: Entity,
    normal: Vector2,
    depth: number
  ): void {
    const totalInvMass = entityA.invMass + entityB.invMass;
    if (totalInvMass === 0) {
      return; // Both static
    }

    // Calculate separation amount
    const correction = Math.min(
      depth * this.config.positionCorrectionFactor,
      this.config.maxPositionCorrection
    );

    // Distribute correction based on inverse mass
    const correctionA = normal.mul(-correction * (entityA.invMass / totalInvMass));
    const correctionB = normal.mul(correction * (entityB.invMass / totalInvMass));

    // Apply corrections and notify position change handlers
    // This ensures that owner.x/y signals are updated after collision resolution
    if (!entityA.isStatic()) {
      entityA.position.addInPlace(correctionA);
      entityA.notifyPositionChange();
    }
    if (!entityB.isStatic()) {
      entityB.position.addInPlace(correctionB);
      entityB.notifyPositionChange();
    }
  }

  /**
   * Resolves velocities using impulse-based collision response
   * 
   * @param entityA - First entity
   * @param entityB - Second entity
   * @param normal - Collision normal (from A to B)
   */
  private resolveVelocities(
    entityA: Entity,
    entityB: Entity,
    normal: Vector2
  ): void {
    // Relative velocity
    const relativeVelocity = entityB.velocity.sub(entityA.velocity);
    const velocityAlongNormal = relativeVelocity.dot(normal);

    // Don't resolve if velocities are separating
    if (velocityAlongNormal > 0) {
      return;
    }

    // Calculate restitution (bounciness)
    const restitution = Math.min(entityA.restitution, entityB.restitution);

    // Calculate impulse scalar
    const totalInvMass = entityA.invMass + entityB.invMass;
    if (totalInvMass === 0) {
      return; // Both static
    }

    // Impulse: j = -(1 + e) * v_rel · n / (1/mA + 1/mB)
    const impulseScalar = -(1 + restitution) * velocityAlongNormal / totalInvMass;
    const impulse = normal.mul(impulseScalar);

    // Apply impulse
    if (!entityA.isStatic()) {
      entityA.velocity.addInPlace(impulse.mul(-entityA.invMass));
      entityA.notifyMovementChange();
      // Note: We don't call notifyDirectionChange() here because collision response
      // should not change the entity's intended direction (visual orientation).
      // Direction changes should only come from intentional movement (player input, AI).
    }
    if (!entityB.isStatic()) {
      entityB.velocity.addInPlace(impulse.mul(entityB.invMass));
      entityB.notifyMovementChange();
      // Note: We don't call notifyDirectionChange() here because collision response
      // should not change the entity's intended direction (visual orientation).
      // Direction changes should only come from intentional movement (player input, AI).
    }

    // Friction (simplified, using velocity tangent to collision)
    const tangent = relativeVelocity.sub(normal.mul(velocityAlongNormal));
    const tangentLength = tangent.length();

    if (tangentLength > 1e-5) {
      const friction = Math.sqrt(entityA.friction * entityB.friction);
      const tangentNormalized = tangent.normalize();
      const frictionImpulse = tangentNormalized.mul(-tangentLength * friction / totalInvMass);

      // Clamp friction impulse to not exceed relative velocity
      const maxFriction = Math.abs(impulseScalar * friction);
      if (frictionImpulse.length() > maxFriction) {
        frictionImpulse.normalizeInPlace().mulInPlace(maxFriction);
      }

      if (!entityA.isStatic()) {
        entityA.velocity.addInPlace(frictionImpulse.mul(-entityA.invMass));
        entityA.notifyMovementChange();
        // Note: We don't call notifyDirectionChange() here because friction adjustments
        // should not change the entity's intended direction (visual orientation).
      }
      if (!entityB.isStatic()) {
        entityB.velocity.addInPlace(frictionImpulse.mul(entityB.invMass));
        entityB.notifyMovementChange();
        // Note: We don't call notifyDirectionChange() here because friction adjustments
        // should not change the entity's intended direction (visual orientation).
      }
    }
  }

  /**
   * Resolves multiple collisions
   * 
   * @param collisions - Array of collisions to resolve
   */
  public resolveAll(collisions: CollisionInfo[]): void {
    for (const collision of collisions) {
      this.resolve(collision);
    }
  }
}

