import { MovementBody, MovementStrategy } from '../MovementStrategy';

/**
 * Oscillates an entity around its initial position using different wave patterns.
 *
 * @example
 * ```typescript
 * movementManager.add(platform, new Oscillate({ x: 1, y: 0 }, 2, 3, 'sine'));
 * ```
 */
export class Oscillate implements MovementStrategy {
  private readonly direction: { x: number; y: number };
  private elapsed = 0;
  private anchor: { x: number; y: number } | null = null;

  /**
   * Creates an oscillating movement.
   *
   * @param direction - Base direction (will be normalized)
   * @param amplitude - Maximum displacement from the anchor position
   * @param period - Duration of a full cycle in seconds
   * @param type - Oscillation pattern
   * @param duration - Total life time in seconds (undefined for infinite)
   */
  constructor(
    direction: { x: number; y: number },
    private readonly amplitude: number,
    private readonly period: number,
    private readonly type: 'linear' | 'sine' | 'circular' = 'sine',
    private readonly duration?: number,
  ) {
    const magnitude = Math.hypot(direction.x, direction.y);
    this.direction = magnitude > 0
      ? { x: direction.x / magnitude, y: direction.y / magnitude }
      : { x: 1, y: 0 };
  }

  update(body: MovementBody, dt: number): void {
    if (this.anchor === null) {
      this.anchor = { x: body.position.x, y: body.position.y };
    }

    this.elapsed += dt;

    if (this.duration !== undefined && this.elapsed >= this.duration) {
      body.setVelocity({ x: 0, y: 0 });
      return;
    }

    const cycle = this.period <= 0 ? 0 : (this.elapsed % this.period) / this.period;

    // Calculate velocity based on the derivative of the oscillation function
    // For sine: derivative is cos, scaled by amplitude and frequency
    const frequency = this.period > 0 ? (2 * Math.PI) / this.period : 0;
    let velocityScale: number;
    
    switch (this.type) {
      case 'sine':
        velocityScale = Math.cos(cycle * Math.PI * 2) * frequency * this.amplitude;
        break;
      case 'circular':
        velocityScale = Math.cos(cycle * Math.PI * 2) * frequency * this.amplitude;
        break;
      case 'linear':
        // Linear oscillation has constant velocity during each half
        const halfCycle = cycle < 0.5;
        velocityScale = (halfCycle ? 1 : -1) * (2 * this.amplitude) / (this.period / 2);
        break;
      default:
        velocityScale = 0;
    }

    const vx = this.direction.x * velocityScale;
    const vy = this.direction.y * velocityScale;
    
    // For circular motion, add perpendicular component
    if (this.type === 'circular') {
      const perpendicularScale = -Math.sin(cycle * Math.PI * 2) * frequency * this.amplitude;
      body.setVelocity({
        x: vx - this.direction.y * perpendicularScale,
        y: vy + this.direction.x * perpendicularScale,
      });
    } else {
      body.setVelocity({ x: vx, y: vy });
    }
  }

  isFinished(): boolean {
    return this.duration !== undefined && this.elapsed >= this.duration;
  }

  reset(): void {
    this.elapsed = 0;
    this.anchor = null;
  }
}

