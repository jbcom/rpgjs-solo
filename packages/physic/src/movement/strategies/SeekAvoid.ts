import { PhysicsEngine } from '../../api/PhysicsEngine';
import { AABB } from '../../core/math/AABB';
import { Vector2 } from '../../core/math/Vector2';
import { createCollider } from '../../collision/detector';
import { Entity } from '../../physics/Entity';
import { MovementBody, MovementStrategy } from '../MovementStrategy';

const EPSILON = 1e-3;
const CENTERED_OBSTACLE_EPSILON = 1e-2;
const OBSTACLE_MARGIN = 4;

/**
 * Seeks a moving target while avoiding nearby obstacles.
 *
 * The strategy combines a pull towards the target with repulsive forces from
 * close entities and local predictive steering, creating smooth avoidance
 * behaviour without computing a full path.
 *
 * @example
 * ```typescript
 * const seek = new SeekAvoid(engine, () => playerEntity, 3, 2, 6, 0.5);
 * movementManager.add(enemy, seek);
 * ```
 */
export class SeekAvoid implements MovementStrategy {
  private repulseRadiusSq: number;
  private arriveRadiusSq: number;
  private lastAvoidanceSide = 1;

  /**
   * @param engine - Physics engine used for spatial queries
   * @param targetProvider - Function returning the target entity (or null)
   * @param maxSpeed - Maximum speed in units per second
   * @param repulseRadius - Radius in which obstacles apply repulsion
   * @param repulseWeight - Strength of the repulsion force
   * @param arriveRadius - Distance considered as arrival
   */
  constructor(
    private readonly engine: PhysicsEngine,
    private readonly targetProvider: () => Entity | null | undefined,
    private maxSpeed = 2.5,
    private repulseRadius = 2,
    private repulseWeight = 4,
    arriveRadius = 0.5,
  ) {
    this.repulseRadiusSq = repulseRadius * repulseRadius;
    this.arriveRadiusSq = arriveRadius * arriveRadius;
  }

  update(body: MovementBody, _dt: number): void {
    const entity = body.getEntity?.();
    if (!entity) {
      throw new Error('SeekAvoid requires a movement body backed by a physics entity.');
    }

    const target = this.targetProvider();
    if (!target) {
      body.setVelocity({ x: 0, y: 0 });
      return;
    }

    const toTarget = new Vector2(target.position.x - entity.position.x, target.position.y - entity.position.y);
    const distSq = toTarget.lengthSquared();
    let arrived = false;

    if (distSq <= this.arriveRadiusSq) {
      toTarget.set(0, 0);
      arrived = true;
    } else if (distSq > 0) {
      toTarget.divInPlace(Math.sqrt(distSq));
    }

    const bounds = AABB.fromCenterSize(entity.position.x, entity.position.y, this.repulseRadius * 2, this.repulseRadius * 2);
    const neighbors = this.engine.queryAABB(bounds);

    const push = new Vector2(0, 0);
    const lateralAvoidance = new Vector2(0, 0);
    if (!arrived) {
      for (const other of neighbors) {
        if (!this.shouldAvoidEntity(entity, other, target)) {
          continue;
        }

        const obstacleVector = this.getObstacleVector(entity, other);
        let d2 = obstacleVector.distanceSq;
        if (d2 > this.repulseRadiusSq) {
          continue;
        }

        if (d2 < EPSILON) {
          d2 = EPSILON;
        }

        const weight = this.repulseWeight / d2;
        push.addInPlace(obstacleVector.away.mul(weight));
        lateralAvoidance.addInPlace(this.getLateralAvoidance(toTarget, obstacleVector.toward, entity, other));
      }
    }

    push.addInPlace(lateralAvoidance);

    const pushLength = push.length();
    // Clamp avoidance so it cannot overwhelm the attraction toward the target.
    // Push should remain weaker than the seek force while still allowing
    // side-stepping around walls and blocking events.
    const maxPush = this.maxSpeed * 0.85;
    if (pushLength > maxPush && pushLength > 0) {
      push.mulInPlace(maxPush / pushLength);
    }

    // Combine seek and avoid forces
    const desired = toTarget.mul(this.maxSpeed).add(push);
    const desiredLength = desired.length();
    
    // Allow the combined velocity to exceed maxSpeed slightly to maintain responsiveness
    const maxCombinedSpeed = this.maxSpeed * 1.5;
    if (desiredLength > maxCombinedSpeed && desiredLength > 0) {
      desired.mulInPlace(maxCombinedSpeed / desiredLength);
    }

    if (!Number.isFinite(desired.x) || !Number.isFinite(desired.y)) {
      body.setVelocity({ x: 0, y: 0 });
      return;
    }

    body.setVelocity(desired);
  }

  private shouldAvoidEntity(entity: Entity, other: Entity, target: Entity): boolean {
    if (other === entity || other === target) {
      return false;
    }
    if (!entity.canCollideWith(other)) {
      return false;
    }
    if (!entity.shouldResolveCollisionWith(other)) {
      return false;
    }
    return true;
  }

  private getLateralAvoidance(
    targetDirection: Vector2,
    toObstacle: Vector2,
    entity: Entity,
    obstacle: Entity,
  ): Vector2 {
    const ahead = toObstacle.dot(targetDirection);
    if (ahead <= 0 || ahead > this.repulseRadius) {
      return new Vector2(0, 0);
    }

    const lateralDistance = Math.abs(targetDirection.cross(toObstacle));
    const corridorRadius = this.getAvoidanceRadius(entity) + this.getAvoidanceRadius(obstacle) + OBSTACLE_MARGIN;
    if (lateralDistance > corridorRadius) {
      return new Vector2(0, 0);
    }

    const cross = targetDirection.cross(toObstacle);
    let side: number;
    if (Math.abs(cross) <= CENTERED_OBSTACLE_EPSILON) {
      side = this.lastAvoidanceSide;
    } else {
      side = -Math.sign(cross);
      this.lastAvoidanceSide = side;
    }

    const perpendicular = new Vector2(-targetDirection.y, targetDirection.x);
    const aheadFactor = 1 - ahead / this.repulseRadius;
    const lateralFactor = 1 - lateralDistance / corridorRadius;
    const strength = this.maxSpeed * Math.max(0, aheadFactor) * Math.max(0, lateralFactor);

    return perpendicular.mul(side * strength);
  }

  private getObstacleVector(entity: Entity, obstacle: Entity): {
    away: Vector2;
    toward: Vector2;
    distanceSq: number;
  } {
    const obstacleBounds = createCollider(obstacle)?.getBounds();
    if (obstacleBounds) {
      const closestX = Math.max(obstacleBounds.minX, Math.min(obstacleBounds.maxX, entity.position.x));
      const closestY = Math.max(obstacleBounds.minY, Math.min(obstacleBounds.maxY, entity.position.y));
      const away = new Vector2(entity.position.x - closestX, entity.position.y - closestY);
      const distanceSq = away.lengthSquared();
      if (distanceSq > EPSILON) {
        return {
          away,
          toward: away.mul(-1),
          distanceSq,
        };
      }
    }

    const toward = new Vector2(obstacle.position.x - entity.position.x, obstacle.position.y - entity.position.y);
    return {
      away: toward.mul(-1),
      toward,
      distanceSq: toward.lengthSquared(),
    };
  }

  private getAvoidanceRadius(entity: Entity): number {
    const halfWidth = entity.width > 0 ? entity.width / 2 : 0;
    const halfHeight = entity.height > 0 ? entity.height / 2 : 0;
    const capsuleRadius = entity.capsule
      ? Math.max(entity.capsule.radius, entity.capsule.height / 2)
      : 0;
    return Math.max(entity.radius, halfWidth, halfHeight, capsuleRadius, 1);
  }

  setParameters(
    maxSpeed?: number,
    repulseRadius?: number,
    repulseWeight?: number,
    arriveRadius?: number,
  ): void {
    if (maxSpeed !== undefined) {
      this.maxSpeed = maxSpeed;
    }
    if (repulseRadius !== undefined) {
      this.repulseRadius = repulseRadius;
      this.repulseRadiusSq = repulseRadius * repulseRadius;
    }
    if (repulseWeight !== undefined) {
      this.repulseWeight = repulseWeight;
    }
    if (arriveRadius !== undefined) {
      this.arriveRadiusSq = arriveRadius * arriveRadius;
    }
  }
}
