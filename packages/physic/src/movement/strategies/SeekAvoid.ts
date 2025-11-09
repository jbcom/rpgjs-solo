import { PhysicsEngine } from '../../api/PhysicsEngine';
import { AABB } from '../../core/math/AABB';
import { Vector2 } from '../../core/math/Vector2';
import { Entity } from '../../physics/Entity';
import { MovementBody, MovementStrategy } from '../MovementStrategy';

const EPSILON = 1e-3;

/**
 * Seeks a moving target while avoiding nearby obstacles.
 *
 * The strategy combines a pull towards the target with repulsive forces from
 * close entities, creating smooth avoidance behaviour.
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
    if (!arrived) {
      for (const other of neighbors) {
        if (other === entity || other === target || other.isStatic()) {
          continue;
        }

        const diff = new Vector2(entity.position.x - other.position.x, entity.position.y - other.position.y);
        let d2 = diff.lengthSquared();
        if (d2 > this.repulseRadiusSq) {
          continue;
        }

        if (d2 < EPSILON) {
          d2 = EPSILON;
        }

        const weight = this.repulseWeight / d2;
        push.addInPlace(diff.mul(weight));
      }
    }

    const pushLength = push.length();
    // Clamp avoidance so it cannot overwhelm the attraction toward the target.
    // Push should be weaker than the seek force
    const maxPush = this.maxSpeed * 0.5;
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

