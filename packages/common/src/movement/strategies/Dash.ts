import * as Matter from 'matter-js';
import { MovementStrategy } from '../MovementStrategy';

/**
 * Implements a dash movement in a specified direction for a limited time
 * 
 * Dash applies high velocity movement in a direction for a short duration
 * 
 * @example
 * ```ts
 * // Dash right for 200ms at speed 10
 * movementManager.add('player1', new Dash(10, { x: 1, y: 0 }, 200));
 * 
 * // Dash diagonally (normalized)
 * movementManager.add('player1', new Dash(8, { x: 0.7071, y: 0.7071 }, 150));
 * ```
 */
export class Dash implements MovementStrategy {
  private elapsed: number = 0;
  private finished: boolean = false;
  
  /**
   * Create a dash movement
   * 
   * @param speed - Movement speed (pixels per frame)
   * @param direction - Normalized direction vector { x, y }
   * @param duration - Duration in milliseconds
   */
  constructor(
    private speed: number,
    private direction: { x: number, y: number },
    private duration: number
  ) {
    // Normalize direction vector if not already normalized
    const magnitude = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
    if (magnitude !== 0 && magnitude !== 1) {
      this.direction = {
        x: direction.x / magnitude,
        y: direction.y / magnitude
      };
    }
  }
  
  /**
   * Apply dash movement to the body
   * 
   * @param body - Matter.js body to move
   * @param dt - Time delta in milliseconds
   */
  update(body: Matter.Body, dt: number): void {
    this.elapsed += dt;
    
    if (this.elapsed <= this.duration) {
      // Apply dash velocity
      Matter.Body.setVelocity(body, {
        x: this.direction.x * this.speed,
        y: this.direction.y * this.speed
      });
    } else {
      // Stop the body when dash is complete
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      this.finished = true;
    }
  }
  
  /**
   * Check if dash duration has elapsed
   * 
   * @returns True if dash is complete
   */
  isFinished(): boolean {
    return this.finished;
  }
  
  /**
   * Optional callback for when dash completes
   * Can be used to chain into another movement
   */
  onFinished(): void {
    // Optional event hook for dash completion
  }
} 