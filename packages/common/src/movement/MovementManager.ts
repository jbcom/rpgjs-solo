import * as Matter from 'matter-js';
import { MovementStrategy } from './MovementStrategy';
import { RpgCommonPhysic } from '../Physic';

/**
 * Manager for entity movement strategies
 * 
 * Handles the execution and lifecycle of all movement strategies
 * for entities in the game world.
 * 
 * @example
 * ```ts
 * // In game loop
 * const movementManager = new MovementManager();
 * 
 * // Add dash movement to player
 * movementManager.add('player1', new Dash(200, { x: 1, y: 0 }, 300));
 * 
 * // Update in game loop
 * function gameLoop(dt) {
 *   movementManager.update(dt, physic);
 *   physic.update(dt);
 * }
 * ```
 */
export class MovementManager {
  /** Map of entity IDs to their active movement strategies */
  private strategies: Map<string, MovementStrategy[]> = new Map();

  /**
   * Add a movement strategy to an entity
   * 
   * @param id - Entity ID
   * @param strategy - Movement strategy to apply
   */
  add(id: string, strategy: MovementStrategy): void {
    if (!this.strategies.has(id)) {
      this.strategies.set(id, []);
    }
    
    this.strategies.get(id)!.push(strategy);
  }

  /**
   * Remove a specific movement strategy from an entity
   * 
   * @param id - Entity ID
   * @param strategy - The strategy instance to remove
   * @returns True if the strategy was found and removed
   */
  remove(id: string, strategy: MovementStrategy): boolean {
    const entityStrategies = this.strategies.get(id);
    if (!entityStrategies) return false;
    
    const index = entityStrategies.indexOf(strategy);
    if (index === -1) return false;
    
    entityStrategies.splice(index, 1);
    return true;
  }

  /**
   * Remove all movement strategies from an entity
   * 
   * @param id - Entity ID
   */
  clear(id: string): void {
    this.strategies.delete(id);
  }

  /**
   * Check if an entity has any active movement strategies
   * 
   * @param id - Entity ID
   * @returns True if entity has active strategies
   * 
   * @example
   * ```ts
   * // Check if player has active movements
   * if (movementManager.hasActiveStrategies('player1')) {
   *   // Don't accept input while movements are active
   * }
   * ```
   */
  hasActiveStrategies(id: string): boolean {
    const entityStrategies = this.strategies.get(id);
    return Boolean(entityStrategies && entityStrategies.length > 0);
  }

  /**
   * Get all active movement strategies for an entity
   * 
   * @param id - Entity ID
   * @returns Array of active strategies or empty array if none
   * 
   * @example
   * ```ts
   * // Get all player movements
   * const movements = movementManager.getStrategies('player1');
   * ```
   */
  getStrategies(id: string): MovementStrategy[] {
    return this.strategies.get(id) || [];
  }

  /**
   * Update all movement strategies
   * Must be called BEFORE physics.update()
   * 
   * @param dt - Time delta in milliseconds
   * @param physic - Physics system to get bodies from
   */
  update(dt: number, physic: RpgCommonPhysic): void {
    for (const [id, strategies] of this.strategies.entries()) {
      // Skip if no strategies
      if (strategies.length === 0) {
        this.strategies.delete(id);
        continue;
      }
      
      // Get the body for this entity
      const body = physic.getBody(id);
      if (!body) continue;
      
      // Update each strategy and remove finished ones
      for (let i = strategies.length - 1; i >= 0; i--) {
        const strategy = strategies[i];
        
        // Apply the movement logic
        strategy.update(body, dt);
        
        // Check if movement is finished
        if (strategy.isFinished?.()) {
          strategies.splice(i, 1);
          
          // Trigger onFinished callback if present
          strategy.onFinished?.();
        }
      }
    }
  }
} 