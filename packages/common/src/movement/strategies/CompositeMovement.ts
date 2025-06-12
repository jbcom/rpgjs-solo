import * as Matter from 'matter-js';
import { MovementStrategy } from '../MovementStrategy';

/**
 * Combines multiple movement strategies into a single movement
 * 
 * Allows composition of movement patterns by either:
 * - Running multiple strategies in parallel (adding their effects)
 * - Running strategies in sequence (one after another)
 * 
 * @example
 * ```ts
 * // Parallel movement (oscillate while following a path)
 * const composite = new CompositeMovement('parallel', [
 *   new PathFollow(waypoints, 2),
 *   new Oscillate({ x: 0, y: 1 }, 10, 1000)
 * ]);
 * 
 * // Sequential movement (dash, then knockback)
 * const sequence = new CompositeMovement('sequence', [
 *   new Dash(8, { x: 1, y: 0 }, 200),
 *   new Knockback({ x: -0.5, y: 0 }, 3, 300)
 * ]);
 * 
 * movementManager.add('entity1', composite);
 * ```
 */
export class CompositeMovement implements MovementStrategy {
  private currentStrategyIndex: number = 0;
  
  /**
   * Create a composite movement
   * 
   * @param mode - How to combine strategies ('parallel' or 'sequence')
   * @param strategies - Array of movement strategies to combine
   */
  constructor(
    private mode: 'parallel' | 'sequence',
    private strategies: MovementStrategy[]
  ) {}
  
  /**
   * Apply the composite movement
   * 
   * @param body - Matter.js body to move
   * @param dt - Time delta in milliseconds
   */
  update(body: Matter.Body, dt: number): void {
    if (this.strategies.length === 0) return;
    
    if (this.mode === 'parallel') {
      // Update all strategies simultaneously
      // Their effects will be combined by the physics engine
      this.updateParallel(body, dt);
    } else {
      // Update strategies in sequence
      this.updateSequence(body, dt);
    }
  }
  
  /**
   * Update all strategies in parallel
   */
  private updateParallel(body: Matter.Body, dt: number): void {
    // Make a copy of the array since we might remove elements during iteration
    const currentStrategies = [...this.strategies];
    
    // Track original velocity to combine movement effects
    const originalVelocity = { x: body.velocity.x, y: body.velocity.y };
    let velocitiesApplied = 0;
    
    // Apply each strategy
    for (let i = currentStrategies.length - 1; i >= 0; i--) {
      const strategy = currentStrategies[i];
      
      // Store velocity before strategy update
      const beforeVx = body.velocity.x;
      const beforeVy = body.velocity.y;
      
      // Apply the strategy
      strategy.update(body, dt);
      
      // Track if velocity was changed
      if (beforeVx !== body.velocity.x || beforeVy !== body.velocity.y) {
        velocitiesApplied++;
      }
      
      // Remove finished strategies
      if (strategy.isFinished?.()) {
        this.strategies.splice(this.strategies.indexOf(strategy), 1);
        strategy.onFinished?.();
      }
    }
    
    // If multiple strategies applied velocities, calculate the average
    if (velocitiesApplied > 1) {
      Matter.Body.setVelocity(body, {
        x: (body.velocity.x + originalVelocity.x) / 2,
        y: (body.velocity.y + originalVelocity.y) / 2
      });
    }
  }
  
  /**
   * Update strategies in sequence
   */
  private updateSequence(body: Matter.Body, dt: number): void {
    if (this.currentStrategyIndex >= this.strategies.length) {
      return;
    }
    
    const currentStrategy = this.strategies[this.currentStrategyIndex];
    
    // Apply the current strategy
    currentStrategy.update(body, dt);
    
    // Check if current strategy is finished
    if (currentStrategy.isFinished?.()) {
      // Trigger completion callback
      currentStrategy.onFinished?.();
      
      // Move to next strategy
      this.currentStrategyIndex++;
    }
  }
  
  /**
   * Check if all strategies have finished
   * 
   * @returns True if all strategies are completed
   */
  isFinished(): boolean {
    if (this.strategies.length === 0) return true;
    
    if (this.mode === 'parallel') {
      // In parallel mode, we're finished when all strategies are finished
      return this.strategies.length === 0;
    } else {
      // In sequence mode, we're finished when we've gone through all strategies
      return this.currentStrategyIndex >= this.strategies.length;
    }
  }
  
  /**
   * Add a new strategy to the composite
   * 
   * @param strategy - Movement strategy to add
   */
  add(strategy: MovementStrategy): void {
    this.strategies.push(strategy);
  }
  
  /**
   * Remove a strategy from the composite
   * 
   * @param strategy - Movement strategy to remove
   * @returns True if the strategy was found and removed
   */
  remove(strategy: MovementStrategy): boolean {
    const index = this.strategies.indexOf(strategy);
    if (index === -1) return false;
    
    this.strategies.splice(index, 1);
    return true;
  }
  
  /**
   * Reset the composite to start from the beginning
   */
  reset(): void {
    this.currentStrategyIndex = 0;
  }
} 