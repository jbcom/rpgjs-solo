import {
  MovementManager as PhysicMovementManager,
  MovementStrategy,
  TopDownPhysics,
} from '@rpgjs/physic';

/**
 * Thin proxy around the physics movement manager.
 *
 * Delegates every operation to the deterministic engine provided by `TopDownPhysics`
 * so strategies operate on the exact same entities as the physics simulation.
 */
export class MovementManager {
  constructor(private readonly physicProvider: () => TopDownPhysics) {}

  private get core(): PhysicMovementManager {
    return this.physicProvider().getEngine().getMovementManager();
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

