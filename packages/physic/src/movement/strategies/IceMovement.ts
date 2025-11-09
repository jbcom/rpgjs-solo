import { MovementBody, MovementStrategy } from '../MovementStrategy';

/**
 * Simulates slippery movement with gradual acceleration and deceleration.
 *
 * @example
 * ```typescript
 * const ice = new IceMovement({ x: 1, y: 0 }, 3, 0.25, 0.1);
 * movementManager.add(player, ice);
 * ```
 */
export class IceMovement implements MovementStrategy {
  private currentVelocity = { x: 0, y: 0 };
  private elapsed = 0;
  private stopped = false;
  private readonly targetDirection: { x: number; y: number };

  /**
   * Creates an ice-like movement behaviour.
   *
   * @param direction - Initial desired direction (normalized automatically)
   * @param maxSpeed - Maximum speed in units per second
   * @param acceleration - Fraction of the gap closed per second (0-1)
   * @param friction - Fraction of velocity retained per second when stopping (0-1)
   * @param duration - Optional duration in seconds
   */
  constructor(
    direction: { x: number; y: number },
    private maxSpeed = 4,
    private acceleration = 0.2,
    private friction = 0.08,
    private readonly duration?: number,
  ) {
    const magnitude = Math.hypot(direction.x, direction.y);
    this.targetDirection = magnitude > 0
      ? { x: direction.x / magnitude, y: direction.y / magnitude }
      : { x: 0, y: 0 };
  }

  update(body: MovementBody, dt: number): void {
    if (this.duration !== undefined) {
      this.elapsed += dt;
      if (this.elapsed >= this.duration) {
        this.stopped = true;
      }
    }

    if (!this.stopped) {
      const accelFactor = this.perSecondFactor(this.acceleration, dt);
      const targetVx = this.targetDirection.x * this.maxSpeed;
      const targetVy = this.targetDirection.y * this.maxSpeed;

      this.currentVelocity.x += (targetVx - this.currentVelocity.x) * accelFactor;
      this.currentVelocity.y += (targetVy - this.currentVelocity.y) * accelFactor;
    } else {
      const frictionFactor = this.perSecondFactor(this.friction, dt);
      this.currentVelocity.x *= 1 - frictionFactor;
      this.currentVelocity.y *= 1 - frictionFactor;
    }

    body.setVelocity({
      x: this.currentVelocity.x,
      y: this.currentVelocity.y,
    });
  }

  isFinished(): boolean {
    if (!this.stopped) {
      return false;
    }
    const speed = Math.hypot(this.currentVelocity.x, this.currentVelocity.y);
    return speed < 0.05;
  }

  stop(): void {
    this.stopped = true;
  }

  resume(): void {
    this.stopped = false;
  }

  setTargetDirection(direction: { x: number; y: number }): void {
    const magnitude = Math.hypot(direction.x, direction.y);
    this.targetDirection.x = magnitude > 0 ? direction.x / magnitude : 0;
    this.targetDirection.y = magnitude > 0 ? direction.y / magnitude : 0;
    this.stopped = false;
  }

  setParameters(maxSpeed?: number, acceleration?: number, friction?: number): void {
    if (maxSpeed !== undefined) {
      this.maxSpeed = maxSpeed;
    }
    if (acceleration !== undefined) {
      this.acceleration = acceleration;
    }
    if (friction !== undefined) {
      this.friction = friction;
    }
  }

  private perSecondFactor(value: number, dt: number): number {
    const clamped = Math.max(0, Math.min(1, value));
    if (dt <= 0) {
      return clamped;
    }
    return 1 - Math.pow(1 - clamped, dt);
  }
}

