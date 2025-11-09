import { MovementBody, MovementStrategy } from '../MovementStrategy';

/**
 * Applies a burst of velocity during a fixed duration.
 *
 * The dash sets a constant velocity along a direction, then stops the entity
 * once the duration has elapsed.
 *
 * @example
 * ```typescript
 * movementManager.add(player, new Dash(8, { x: 1, y: 0 }, 0.15));
 * ```
 */
export class Dash implements MovementStrategy {
  private elapsed = 0;
  private readonly direction: { x: number; y: number };
  private finished = false;

  /**
   * Creates a dash movement.
   *
   * @param speed - Movement speed in units per second
   * @param direction - Direction vector (will be normalized)
   * @param duration - Duration in seconds
   */
  constructor(
    private readonly speed: number,
    direction: { x: number; y: number },
    private readonly duration: number,
  ) {
    const magnitude = Math.hypot(direction.x, direction.y);
    this.direction = magnitude > 0
      ? { x: direction.x / magnitude, y: direction.y / magnitude }
      : { x: 1, y: 0 };
  }

  update(body: MovementBody, dt: number): void {
    if (this.finished) {
      return;
    }

    this.elapsed += dt;

    if (this.elapsed <= this.duration) {
      body.setVelocity({
        x: this.direction.x * this.speed,
        y: this.direction.y * this.speed,
      });
    } else {
      body.setVelocity({ x: 0, y: 0 });
      this.finished = true;
    }
  }

  isFinished(): boolean {
    return this.finished;
  }
}

