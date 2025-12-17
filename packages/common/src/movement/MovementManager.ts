import {
  MovementManager as PhysicMovementManager,
  MovementStrategy,
  MovementOptions,
  PhysicsEngine,
} from '@rpgjs/physic';

/**
 * Thin proxy around the physics movement manager.
 *
 * Delegates every operation to the deterministic engine provided by `PhysicsEngine`
 * so strategies operate on the exact same entities as the physics simulation.
 */
export class MovementManager {
  constructor(private readonly physicProvider: () => PhysicsEngine) {}

  private get core(): PhysicMovementManager {
    return this.physicProvider().getMovementManager();
  }

  /**
   * Adds a movement strategy and returns a Promise that resolves when it completes.
   * 
   * @param id - Entity identifier
   * @param strategy - Movement strategy to add
   * @param options - Optional callbacks for movement lifecycle events
   * @returns Promise that resolves when the movement completes
   */
  add(id: string, strategy: MovementStrategy, options?: MovementOptions): Promise<void> {
    return this.core.add(id, strategy, options);
  }

  remove(id: string, strategy: MovementStrategy): boolean {
    return this.core.remove(id, strategy);
  }

  clear(id: string): void {
    this.core.clear(id);
  }

  stopMovement(id: string): void {
    this.core.stopMovement(id);
  }

  hasActiveStrategies(id: string): boolean {
    return this.core.hasActiveStrategies(id);
  }

  getStrategies(id: string): MovementStrategy[] {
    return this.core.getStrategies(id);
  }

  update(dtMs: number): void {
    this.core.update(dtMs / 1000);
  }

  clearAll(): void {
    this.core.clearAll();
  }
}

