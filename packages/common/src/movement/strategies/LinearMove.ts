import * as Matter from 'matter-js';
import { MovementStrategy } from '../MovementStrategy';

/**
 * Applies constant velocity movement in a specified direction
 * 
 * Used for simple linear movement at a constant speed
 * 
 * @example
 * ```ts
 * // Move entity right at 5 pixels per frame
 * movementManager.add('entity1', new LinearMove(5, 0));
 * 
 * // Move diagonally
 * movementManager.add('entity1', new LinearMove(3, 3));
 * ```
 */
export class LinearMove implements MovementStrategy {
  /**
   * Create a linear movement
   * 
   * @param vx - X velocity component
   * @param vy - Y velocity component
   * @param duration - Optional duration in milliseconds (if not set, movement continues indefinitely)
   */
  constructor(
    private vx: number, 
    private vy: number, 
    private duration?: number
  ) {
    this.elapsed = 0;
  }

  private elapsed: number;

  /**
   * Apply velocity to the body
   * 
   * @param body - Matter.js body to move
   * @param dt - Time delta in milliseconds
   */
  update(body: Matter.Body, dt: number): void {
    if (this.duration !== undefined) {
      this.elapsed += dt;
    }
    
    Matter.Body.setVelocity(body, { x: this.vx, y: this.vy });
  }

  /**
   * Check if movement duration has elapsed
   * 
   * @returns True if movement should stop
   */
  isFinished(): boolean {
    return this.duration !== undefined && this.elapsed >= this.duration;
  }
} 