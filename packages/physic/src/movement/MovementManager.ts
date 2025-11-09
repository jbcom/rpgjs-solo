import { PhysicsEngine } from '../api/PhysicsEngine';
import { Entity } from '../physics/Entity';
import { EntityMovementBody } from './adapters/EntityMovementBody';
import { MovementBody, MovementStrategy } from './MovementStrategy';

/**
 * Resolves an entity from an identifier.
 *
 * When provided to the movement manager, the resolver enables ergonomic calls
 * that pass a string identifier instead of the `Entity` instance.
 *
 * @example
 * ```typescript
 * const manager = new MovementManager((id) => engine.getEntityByUUID(id));
 * manager.add(player.uuid, new Dash(6, { x: 1, y: 0 }, 0.2));
 * ```
 */
export type EntityResolver = (id: string) => MovementBody | undefined;

interface MovementEntry {
  body: MovementBody;
  strategies: MovementStrategy[];
}

/**
 * Manages movement strategies assigned to entities.
 *
 * The manager executes strategies before each physics step, removes completed
 * behaviours and exposes utilities to inspect and maintain assignments.
 *
 * @example
 * ```typescript
 * const manager = new MovementManager((id) => engine.getEntityByUUID(id));
 * manager.add(playerEntity, new LinearMove({ x: 2, y: 0 }));
 *
 * // Game loop
 * manager.update(deltaSeconds);
 * engine.step();
 * ```
 */
export class MovementManager {
  private readonly entries: Map<string, MovementEntry> = new Map();
  private readonly entityWrappers = new WeakMap<Entity, EntityMovementBody>();

  constructor(private readonly resolveEntity?: EntityResolver) {}

  /**
   * Convenience factory that binds the manager to a physics engine.
   *
   * @param engine - Physics engine whose entities will be controlled
   * @returns A movement manager configured with an entity resolver
   */
  static forEngine(engine: PhysicsEngine): MovementManager {
    let manager: MovementManager;
    manager = new MovementManager((id) => {
      const entity = engine.getEntityByUUID(id);
      return entity ? manager.wrapEntity(entity) : undefined;
    });
    return manager;
  }

  /**
   * Adds a movement strategy to an entity.
   *
   * @param target - Entity instance or entity UUID when a resolver is configured
   * @param strategy - Strategy to execute
   */
  add(target: Entity | MovementBody | string, strategy: MovementStrategy): void {
    const body = this.resolveTarget(target);
    const key = body.id;

    if (!this.entries.has(key)) {
      this.entries.set(key, { body, strategies: [] });
    }

    this.entries.get(key)!.strategies.push(strategy);
  }

  /**
   * Removes a specific strategy from an entity.
   *
   * @param target - Entity instance or identifier
   * @param strategy - Strategy instance to remove
   * @returns True when the strategy has been removed
   */
  remove(target: Entity | MovementBody | string, strategy: MovementStrategy): boolean {
    const body = this.resolveTarget(target);
    const entry = this.entries.get(body.id);
    if (!entry) {
      return false;
    }

    const index = entry.strategies.indexOf(strategy);
    if (index === -1) {
      return false;
    }

    entry.strategies.splice(index, 1);
    if (entry.strategies.length === 0) {
      this.entries.delete(body.id);
    }
    return true;
  }

  /**
   * Removes all strategies from an entity.
   *
   * @param target - Entity or identifier
   */
  clear(target: Entity | MovementBody | string): void {
    const body = this.resolveTarget(target);
    this.entries.delete(body.id);
  }

  /**
   * Checks if an entity has active strategies.
   *
  * @param target - Entity or identifier
  * @returns True when strategies are registered
   */
  hasActiveStrategies(target: Entity | MovementBody | string): boolean {
    const body = this.resolveTarget(target);
    return (this.entries.get(body.id)?.strategies.length ?? 0) > 0;
  }

  /**
   * Returns a snapshot of the strategies assigned to an entity.
   *
   * @param target - Entity or identifier
   * @returns Copy of the strategies array (empty array when none)
   */
  getStrategies(target: Entity | MovementBody | string): MovementStrategy[] {
    const body = this.resolveTarget(target);
    const entry = this.entries.get(body.id);
    return entry ? [...entry.strategies] : [];
  }

  /**
   * Updates all registered strategies.
   *
   * Call this method once per frame before `PhysicsEngine.step()` so that the
   * physics simulation integrates the velocities that strategies configure.
   *
   * @param dt - Time delta in seconds
   */
  update(dt: number): void {
    for (const [key, entry] of this.entries) {
      const { body, strategies } = entry;

      if (strategies.length === 0) {
        this.entries.delete(key);
        continue;
      }

      for (let i = strategies.length - 1; i >= 0; i -= 1) {
        const current = strategies[i];
        if (!current) {
          continue;
        }

        current.update(body, dt);

        if (current.isFinished?.()) {
          strategies.splice(i, 1);
          current.onFinished?.();
        }
      }

      if (strategies.length === 0) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Removes all strategies from all entities.
   */
  clearAll(): void {
    this.entries.clear();
  }

  private resolveTarget(target: Entity | MovementBody | string): MovementBody {
    if (this.isMovementBody(target)) {
      return target;
    }

    if (target instanceof Entity) {
      return this.wrapEntity(target);
    }

    if (!this.resolveEntity) {
      throw new Error('MovementManager: cannot resolve entity from identifier without a resolver.');
    }

    const entity = this.resolveEntity(target);
    if (!entity) {
      throw new Error(`MovementManager: unable to resolve entity for identifier ${target}.`);
    }
    return entity;
  }

  private wrapEntity(entity: Entity): EntityMovementBody {
    let wrapper = this.entityWrappers.get(entity);
    if (!wrapper) {
      wrapper = new EntityMovementBody(entity);
      this.entityWrappers.set(entity, wrapper);
    }
    return wrapper;
  }

  private isMovementBody(value: unknown): value is MovementBody {
    return Boolean(
      value &&
      typeof value === 'object' &&
      'id' in value &&
      'setVelocity' in value &&
      typeof (value as MovementBody).setVelocity === 'function',
    );
  }
}

