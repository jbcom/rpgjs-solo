import { Entity } from './Entity';
import { Vector2 } from '../core/math/Vector2';

/**
 * Constraint interface
 * 
 * Constraints limit the motion of entities (springs, joints, etc.)
 */
export interface Constraint {
  /**
   * Updates the constraint
   * 
   * @param deltaTime - Time step
   */
  update(deltaTime: number): void;
}

/**
 * Spring constraint between two entities
 * 
 * Connects two entities with a spring that applies forces to maintain
 * a target distance.
 * 
 * @example
 * ```typescript
 * const spring = new SpringConstraint(entity1, entity2, 10, 0.5, 0.1);
 * spring.update(1/60);
 * ```
 */
export class SpringConstraint implements Constraint {
  private entityA: Entity;
  private entityB: Entity;
  private restLength: number;
  private springConstant: number;
  private damping: number;

  /**
   * Creates a new spring constraint
   * 
   * @param entityA - First entity
   * @param entityB - Second entity
   * @param restLength - Rest length of the spring
   * @param springConstant - Spring constant (stiffness)
   * @param damping - Damping coefficient
   */
  constructor(
    entityA: Entity,
    entityB: Entity,
    restLength: number,
    springConstant: number,
    damping: number
  ) {
    this.entityA = entityA;
    this.entityB = entityB;
    this.restLength = restLength;
    this.springConstant = springConstant;
    this.damping = damping;
  }

  /**
   * @inheritdoc
   */
  public update(deltaTime: number): void {
    const direction = this.entityB.position.sub(this.entityA.position);
    const distance = direction.length();

    if (distance < 0.001) {
      return; // Entities overlap, skip
    }

    // Spring force: F = -k * (x - x0)
    const displacement = distance - this.restLength;
    const springForce = this.springConstant * displacement;

    direction.normalizeInPlace();
    const force = direction.mul(springForce);

    // Apply forces (opposite directions)
    this.entityA.applyForce(force.mul(-1));
    this.entityB.applyForce(force);

    // Damping (relative velocity)
    if (this.damping > 0) {
      const relativeVelocity = this.entityB.velocity.sub(this.entityA.velocity);
      const dampingForce = direction.mul(-this.damping * relativeVelocity.dot(direction));
      this.entityA.applyForce(dampingForce.mul(-1));
      this.entityB.applyForce(dampingForce);
    }
  }

  /**
   * Gets the current length of the spring
   * 
   * @returns Current length
   */
  public getCurrentLength(): number {
    return this.entityA.position.distanceTo(this.entityB.position);
  }
}

/**
 * Distance constraint between two entities
 * 
 * Maintains a fixed distance between two entities using impulses.
 * 
 * @example
 * ```typescript
 * const constraint = new DistanceConstraint(entity1, entity2, 10);
 * constraint.update(1/60);
 * ```
 */
export class DistanceConstraint implements Constraint {
  private entityA: Entity;
  private entityB: Entity;
  private targetDistance: number;
  private stiffness: number;

  /**
   * Creates a new distance constraint
   * 
   * @param entityA - First entity
   * @param entityB - Second entity
   * @param targetDistance - Target distance to maintain
   * @param stiffness - Constraint stiffness (0-1, higher = stiffer)
   */
  constructor(
    entityA: Entity,
    entityB: Entity,
    targetDistance: number,
    stiffness = 0.9
  ) {
    this.entityA = entityA;
    this.entityB = entityB;
    this.targetDistance = targetDistance;
    this.stiffness = stiffness;
  }

  /**
   * @inheritdoc
   */
  public update(deltaTime: number): void {
    const direction = this.entityB.position.sub(this.entityA.position);
    const distance = direction.length();

    if (distance < 0.001) {
      return; // Entities overlap, skip
    }

    const error = distance - this.targetDistance;
    if (Math.abs(error) < 0.001) {
      return; // Already at target distance
    }

    direction.normalizeInPlace();

    // Calculate correction
    const totalInvMass = this.entityA.invMass + this.entityB.invMass;
    if (totalInvMass === 0) {
      return; // Both static
    }

    const correction = (error * this.stiffness) / totalInvMass;
    const correctionA = direction.mul(-correction * this.entityA.invMass);
    const correctionB = direction.mul(correction * this.entityB.invMass);

    // Apply position correction
    if (!this.entityA.isStatic()) {
      this.entityA.position.addInPlace(correctionA);
    }
    if (!this.entityB.isStatic()) {
      this.entityB.position.addInPlace(correctionB);
    }
  }

  /**
   * Gets the current distance
   * 
   * @returns Current distance
   */
  public getCurrentDistance(): number {
    return this.entityA.position.distanceTo(this.entityB.position);
  }
}

/**
 * Anchor constraint (pins an entity to a point)
 * 
 * @example
 * ```typescript
 * const anchor = new AnchorConstraint(entity, new Vector2(0, 0), 0.5);
 * anchor.update(1/60);
 * ```
 */
export class AnchorConstraint implements Constraint {
  private entity: Entity;
  private anchorPoint: Vector2;
  private stiffness: number;

  /**
   * Creates a new anchor constraint
   * 
   * @param entity - Entity to anchor
   * @param anchorPoint - Anchor point in world space
   * @param stiffness - Constraint stiffness (0-1)
   */
  constructor(entity: Entity, anchorPoint: Vector2, stiffness = 0.9) {
    this.entity = entity;
    this.anchorPoint = anchorPoint.clone();
    this.stiffness = stiffness;
  }

  /**
   * @inheritdoc
   */
  public update(deltaTime: number): void {
    if (this.entity.isStatic()) {
      return;
    }

    const direction = this.anchorPoint.sub(this.entity.position);
    const distance = direction.length();

    if (distance < 0.001) {
      return; // Already at anchor
    }

    direction.normalizeInPlace();
    const correction = direction.mul(distance * this.stiffness);
    this.entity.position.addInPlace(correction);
  }

  /**
   * Sets the anchor point
   * 
   * @param point - New anchor point
   */
  public setAnchorPoint(point: Vector2): void {
    this.anchorPoint.copyFrom(point);
  }

  /**
   * Gets the anchor point
   * 
   * @returns Anchor point
   */
  public getAnchorPoint(): Vector2 {
    return this.anchorPoint.clone();
  }
}

