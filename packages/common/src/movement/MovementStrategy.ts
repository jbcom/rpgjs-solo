import * as Matter from 'matter-js';

/**
 * Interface defining the contract for movement strategies
 * 
 * Movement strategies are responsible for calculating how a body should move
 * each frame without directly modifying the physics engine.
 * 
 * @example
 * ```ts
 * class SimpleMove implements MovementStrategy {
 *   constructor(private vx: number, private vy: number) {}
 *   
 *   update(body: Matter.Body, dt: number): void {
 *     Matter.Body.setVelocity(body, { x: this.vx, y: this.vy });
 *   }
 * }
 * ```
 */
export interface MovementStrategy {
  /**
   * Called each frame BEFORE the physics engine update
   * Calculates and applies movement to the provided body
   * 
   * @param body - The Matter.js body to move
   * @param dt - Time delta in milliseconds
   */
  update(body: Matter.Body, dt: number): void;
  
  /**
   * Returns true when the movement is finished (optional)
   * If implemented, the strategy will be automatically removed
   * from the movement manager when it returns true
   */
  isFinished?(): boolean;
  
  /**
   * Event triggered when the movement completes (optional)
   * Useful for chaining movements
   */
  onFinished?(): void;
} 