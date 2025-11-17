import {
  MovementManager as PhysicMovementManager,
  MovementStrategy,
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

  add(id: string, strategy: MovementStrategy): void {
    this.core.add(id, strategy);
  }

  remove(id: string, strategy: MovementStrategy): boolean {
    return this.core.remove(id, strategy);
  }

  clear(id: string): void {
    this.core.clear(id);
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

