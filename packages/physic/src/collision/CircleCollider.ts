import { Vector2 } from '../core/math/Vector2';
import { AABB } from '../core/math/AABB';
import { Entity } from '../physics/Entity';
import { Collider, CollisionInfo, ContactPoint } from './Collider';
import { AABBCollider } from './AABBCollider';
import { Ray, RaycastHit } from './Ray';

/**
 * Circle collider implementation
 * 
 * Represents a circular collision shape.
 * 
 * @example
 * ```typescript
 * const entity = new Entity({ position: { x: 0, y: 0 }, radius: 10 });
 * const collider = new CircleCollider(entity);
 * ```
 */
export class CircleCollider implements Collider {
  private entity: Entity;

  /**
   * Creates a new circle collider
   * 
   * @param entity - Entity this collider belongs to
   */
  constructor(entity: Entity) {
    this.entity = entity;
  }

  /**
   * Gets the radius of the circle
   * 
   * @returns Radius
   */
  public getRadius(): number {
    return this.entity.radius;
  }

  /**
   * Gets the center position of the circle
   * 
   * @returns Center position
   */
  public getCenter(): Vector2 {
    return this.entity.position;
  }

  /**
   * @inheritdoc
   */
  public getBounds(): AABB {
    const radius = this.entity.radius;
    const center = this.entity.position;
    return new AABB(
      center.x - radius,
      center.y - radius,
      center.x + radius,
      center.y + radius
    );
  }

  /**
   * @inheritdoc
   */
  public testCollision(other: Collider): CollisionInfo | null {
    if (other instanceof CircleCollider) {
      return this.testCircleCircle(other);
    } else if (other instanceof AABBCollider) {
      return this.testCircleAABB(other);
    }
    return null;
  }

  /**
   * Tests collision with another circle
   * 
   * @param other - Other circle collider
   * @returns Collision info or null
   */
  private testCircleCircle(other: CircleCollider): CollisionInfo | null {
    const centerA = this.getCenter();
    const centerB = other.getCenter();
    const radiusA = this.getRadius();
    const radiusB = other.getRadius();

    const distance = centerA.distanceTo(centerB);
    const minDistance = radiusA + radiusB;

    if (distance >= minDistance) {
      return null; // No collision
    }

    const depth = minDistance - distance;
    let normal: Vector2;

    if (distance < 1e-5) {
      // Circles are at the same position, use arbitrary normal
      normal = new Vector2(1, 0);
    } else {
      normal = centerB.sub(centerA).normalize();
    }

    const contactPoint = centerA.add(normal.mul(radiusA));

    return {
      entityA: this.entity,
      entityB: other.entity,
      contacts: [
        {
          point: contactPoint,
          normal,
          depth,
        },
      ],
      normal,
      depth,
    };
  }

  /**
   * Tests collision with an AABB
   * 
   * @param other - AABB collider
   * @returns Collision info or null
   */
  private testCircleAABB(other: AABBCollider): CollisionInfo | null {
    const circleCenter = this.getCenter();
    const circleRadius = this.getRadius();
    const aabb = other.getBounds();

    // Find closest point on AABB to circle center
    const closestX = Math.max(aabb.minX, Math.min(circleCenter.x, aabb.maxX));
    const closestY = Math.max(aabb.minY, Math.min(circleCenter.y, aabb.maxY));

    const distanceSq = (circleCenter.x - closestX) ** 2 + (circleCenter.y - closestY) ** 2;

    if (distanceSq > circleRadius * circleRadius) {
      return null; // No collision
    }

    const distance = Math.sqrt(distanceSq);
    const depth = circleRadius - distance;

    let normal: Vector2;
    if (distance < 1e-5) {
      // Circle center is inside AABB
      // Find the closest edge
      const distToLeft = circleCenter.x - aabb.minX;
      const distToRight = aabb.maxX - circleCenter.x;
      const distToBottom = circleCenter.y - aabb.minY;
      const distToTop = aabb.maxY - circleCenter.y;

      const minDist = Math.min(distToLeft, distToRight, distToBottom, distToTop);

      if (minDist === distToLeft) {
        normal = new Vector2(-1, 0);
      } else if (minDist === distToRight) {
        normal = new Vector2(1, 0);
      } else if (minDist === distToBottom) {
        normal = new Vector2(0, -1);
      } else {
        normal = new Vector2(0, 1);
      }
    } else {
      normal = new Vector2(closestX - circleCenter.x, closestY - circleCenter.y).normalize();
    }

    const contactPoint = new Vector2(closestX, closestY);

    return {
      entityA: this.entity,
      entityB: other.getEntity(),
      contacts: [
        {
          point: contactPoint,
          normal,
          depth,
        },
      ],
      normal,
      depth,
    };
  }

  /**
   * @inheritdoc
   */
  public getContactPoints(other: Collider): ContactPoint[] {
    const collision = this.testCollision(other);
    return collision?.contacts ?? [];
  }

  /**
   * @inheritdoc
   */
  public getEntity(): Entity {
    return this.entity;
  }

  /**
   * @inheritdoc
   */
  public raycast(ray: Ray): RaycastHit | null {
    const center = this.getCenter();
    const radius = this.getRadius();
    const m = ray.origin.sub(center);
    const b = m.dot(ray.direction);
    const c = m.dot(m) - radius * radius;

    // Exit if ray's origin is outside circle (c > 0) and ray is pointing away from circle (b > 0)
    if (c > 0 && b > 0) return null;

    const discr = b * b - c;

    // A negative discriminant corresponds to ray missing circle
    if (discr < 0) return null;

    // Ray now found to intersect circle, compute smallest t value of intersection
    let t = -b - Math.sqrt(discr);

    // If t is negative, ray started inside circle so clamp t to 0
    if (t < 0) t = 0;

    if (t > ray.length) return null;

    const point = ray.getPoint(t);
    const normal = point.sub(center).normalize();

    return {
      entity: this.entity,
      point,
      normal,
      distance: t,
    };
  }
}

