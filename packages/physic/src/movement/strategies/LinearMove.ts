import { MovementBody, MovementStrategy } from '../MovementStrategy';

/**
 * Applies a constant velocity to an entity for an optional duration.
 *
 * The velocity is expressed in world units per second and is assigned directly
 * to the entity before each physics step.
 *
 * @example
 * ```typescript
 * const move = new LinearMove({ x: 2, y: 0 });
 * movementManager.add(entity, move);
 * ```
 */
export class LinearMove implements MovementStrategy {
  private elapsed = 0;

  /**
   * Creates a linear movement strategy.
   *
   * @param velocity - Velocity to apply (units per second)
   * @param duration - Optional duration in seconds (undefined for infinite)
   */
  constructor(
    private readonly velocity: { x: number; y: number },
    private readonly duration?: number,
  ) {}

  update(body: MovementBody, dt: number): void {
    if (this.duration !== undefined) {
      this.elapsed += dt;
    }
    body.setVelocity(this.velocity);
  }

  isFinished(): boolean {
    return this.duration !== undefined && this.elapsed >= this.duration;
  }
}

