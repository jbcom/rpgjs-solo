import { MovementBody, MovementStrategy } from '../MovementStrategy';

/**
 * Simulates an impulse that pushes an entity away and gradually decays.
 *
 * @example
 * ```typescript
 * movementManager.add(enemy, new Knockback({ x: -1, y: 0 }, 12, 0.25, 0.4));
 * ```
 */
export class Knockback implements MovementStrategy {
  private readonly direction: { x: number; y: number };
  private elapsed = 0;
  private currentSpeed: number;

  /**
   * Creates a knockback movement.
   *
   * @param direction - Direction of the impulse (will be normalized)
   * @param initialSpeed - Initial speed in units per second
   * @param duration - Duration in seconds
   * @param decayFactor - Fraction of speed preserved per second (0-1)
   */
  constructor(
    direction: { x: number; y: number },
    initialSpeed: number,
    private readonly duration: number,
    private readonly decayFactor = 0.35,
  ) {
    const magnitude = Math.hypot(direction.x, direction.y);
    this.direction = magnitude > 0
      ? { x: direction.x / magnitude, y: direction.y / magnitude }
      : { x: 1, y: 0 };
    this.currentSpeed = initialSpeed;
  }

  update(body: MovementBody, dt: number): void {
    this.elapsed += dt;

    if (this.elapsed <= this.duration) {
      body.setVelocity({
        x: this.direction.x * this.currentSpeed,
        y: this.direction.y * this.currentSpeed,
      });

      const decay = Math.max(0, Math.min(1, this.decayFactor));
      if (decay === 0) {
        this.currentSpeed = 0;
      } else if (decay === 1) {
        // preserve speed, no change
      } else {
        this.currentSpeed *= Math.pow(decay, dt);
      }
    } else {
      body.setVelocity({ x: 0, y: 0 });
    }
  }

  isFinished(): boolean {
    return this.elapsed >= this.duration;
  }
}

