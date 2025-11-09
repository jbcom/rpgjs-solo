import { PhysicsEngine } from '../../api/PhysicsEngine';
import { AABB } from '../../core/math/AABB';
import { Vector2 } from '../../core/math/Vector2';
import { Entity } from '../../physics/Entity';
import { MovementBody, MovementStrategy } from '../MovementStrategy';

/**
 * Seeks a target while repelling from nearby obstacles using a linear falloff.
 *
 * @example
 * ```typescript
 * const strategy = new LinearRepulsion(
 *   engine,
 *   () => player.position.clone(),
 *   3,
 *   2,
 *   5,
 * );
 * movementManager.add(enemy, strategy);
 * ```
 */
export class LinearRepulsion implements MovementStrategy {
  private repulseRadiusSq: number;

  /**
   * @param engine - Physics engine used for spatial queries
   * @param targetProvider - Function returning the target position
   * @param maxSpeed - Maximum speed in units per second
   * @param repulseRadius - Radius used to sample nearby obstacles
   * @param repulseWeight - Weight of the repulsion force
   * @param ignoredEntity - Optional entity to exclude from avoidance (e.g. the target)
   */
  constructor(
    private readonly engine: PhysicsEngine,
    private readonly targetProvider: () => { x: number; y: number },
    private maxSpeed = 2.5,
    private repulseRadius = 2,
    private repulseWeight = 4,
    private readonly ignoredEntity?: () => Entity | undefined,
  ) {
    this.repulseRadiusSq = repulseRadius * repulseRadius;
  }

  update(body: MovementBody, _dt: number): void {
    const entity = body.getEntity?.();
    if (!entity) {
      throw new Error('LinearRepulsion requires a movement body backed by a physics entity.');
    }

    const targetPosition = this.targetProvider();
    const toTarget = new Vector2(targetPosition.x - entity.position.x, targetPosition.y - entity.position.y);
    const distance = toTarget.length();

    if (distance > 0) {
      toTarget.divInPlace(distance);
    } else {
      toTarget.set(0, 0);
    }

    const bounds = AABB.fromCenterSize(entity.position.x, entity.position.y, this.repulseRadius * 2, this.repulseRadius * 2);
    const neighbors = this.engine.queryAABB(bounds);
    const ignored = this.ignoredEntity?.();

    const push = new Vector2(0, 0);
    for (const other of neighbors) {
      if (other === entity || other === ignored || other.isStatic()) {
        continue;
      }

      const diff = new Vector2(entity.position.x - other.position.x, entity.position.y - other.position.y);
      const d2 = diff.lengthSquared();
      if (d2 > this.repulseRadiusSq || d2 === 0) {
        continue;
      }

      const d = Math.sqrt(d2);
      const weight = this.repulseWeight * (this.repulseRadius - Math.min(d, this.repulseRadius)) / this.repulseRadius;
      push.addInPlace(diff.mul(weight / d));
    }

    const maxPush = this.maxSpeed * 3;
    const pushLength = push.length();
    if (pushLength > maxPush && pushLength > 0) {
      push.mulInPlace(maxPush / pushLength);
    }

    const desired = toTarget.mul(this.maxSpeed).add(push);
    const desiredLength = desired.length();
    if (desiredLength > this.maxSpeed && desiredLength > 0) {
      desired.mulInPlace(this.maxSpeed / desiredLength);
    }

    if (!Number.isFinite(desired.x) || !Number.isFinite(desired.y)) {
      entity.setVelocity({ x: 0, y: 0 });
      return;
    }

    body.setVelocity(desired);
  }

  setParameters(maxSpeed?: number, repulseRadius?: number, repulseWeight?: number): void {
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
  }
}

