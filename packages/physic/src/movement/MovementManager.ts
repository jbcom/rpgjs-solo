import { PhysicsEngine } from '../api/PhysicsEngine';
import { Entity } from '../physics/Entity';
import { EntityMovementBody } from './adapters/EntityMovementBody';
import { MovementBody, MovementStrategy, MovementOptions } from './MovementStrategy';

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

/**
 * Internal entry for tracking a strategy with its options and Promise resolver
 */
interface StrategyEntry {
  strategy: MovementStrategy;
  options?: MovementOptions;
  resolve?: () => void;
  started: boolean;
}

interface MovementEntry {
  body: MovementBody;
  strategies: StrategyEntry[];
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
   * Returns a Promise that resolves when the movement completes (when `isFinished()` returns true).
   * If the strategy doesn't implement `isFinished()`, the Promise resolves immediately after adding.
   *
   * @param target - Entity instance or entity UUID when a resolver is configured
   * @param strategy - Strategy to execute
   * @param options - Optional callbacks for movement lifecycle events
   * @returns Promise that resolves when the movement completes
   * 
   * @example
   * ```typescript
   * // Simple usage - fire and forget
   * manager.add(player, new Dash(8, { x: 1, y: 0 }, 200));
   * 
   * // Wait for completion
   * await manager.add(player, new Dash(8, { x: 1, y: 0 }, 200));
   * console.log('Dash finished!');
   * 
   * // With callbacks
   * await manager.add(player, new Knockback({ x: -1, y: 0 }, 5, 300), {
   *   onStart: () => {
   *     player.directionFixed = true;
   *     player.animationFixed = true;
   *   },
   *   onComplete: () => {
   *     player.directionFixed = false;
   *     player.animationFixed = false;
   *   }
   * });
   * ```
   */
  add(target: Entity | MovementBody | string, strategy: MovementStrategy, options?: MovementOptions): Promise<void> {
    const body = this.resolveTarget(target);
    const key = body.id;

    if (!this.entries.has(key)) {
      this.entries.set(key, { body, strategies: [] });
    }

    // If the strategy doesn't have isFinished, resolve immediately
    if (!strategy.isFinished) {
      const entry: StrategyEntry = { strategy, started: false };
      if (options) {
        entry.options = options;
      }
      this.entries.get(key)!.strategies.push(entry);
      return Promise.resolve();
    }

    // Create a Promise that will resolve when the strategy finishes
    return new Promise<void>((resolve) => {
      const entry: StrategyEntry = { strategy, resolve, started: false };
      if (options) {
        entry.options = options;
      }
      this.entries.get(key)!.strategies.push(entry);
    });
  }

  /**
   * Removes a specific strategy from an entity.
   * 
   * Note: This will NOT trigger the onComplete callback or resolve the Promise.
   * Use this when you want to cancel a movement without completion.
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

    const index = entry.strategies.findIndex(e => e.strategy === strategy);
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
   * Stops all movement for an entity immediately
   * 
   * This method completely stops an entity's movement by:
   * - Removing all active movement strategies (dash, linear moves, etc.)
   * - Stopping the entity's velocity and angular velocity
   * - Clearing accumulated forces
   * - Waking up the entity if it was sleeping
   * 
   * This is useful when changing maps, teleporting, or when you need
   * to halt an entity's movement completely without making it static.
   * 
   * @param target - Entity, MovementBody, or identifier
   * 
   * @example
   * ```ts
   * // Stop movement when changing maps
   * if (mapChanged) {
   *   movement.stopMovement(playerEntity);
   * }
   * 
   * // Stop movement after teleporting
   * entity.position.set(100, 200);
   * movement.stopMovement(entity);
   * 
   * // Stop movement when player dies
   * if (player.isDead()) {
   *   movement.stopMovement(playerEntity);
   * }
   * ```
   */
  stopMovement(target: Entity | MovementBody | string): void {
    const body = this.resolveTarget(target);
    
    // Remove all movement strategies
    this.clear(target);
    
    // If the body wraps an Entity, stop its movement directly
    if ('getEntity' in body && typeof (body as any).getEntity === 'function') {
      const entity = (body as any).getEntity();
      if (entity && typeof entity.stopMovement === 'function') {
        entity.stopMovement();
      }
    }
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
    return entry ? entry.strategies.map(e => e.strategy) : [];
  }

  /**
   * Updates all registered strategies.
   *
   * Call this method once per frame before `PhysicsEngine.step()` so that the
   * physics simulation integrates the velocities that strategies configure.
   * 
   * This method handles the movement lifecycle:
   * - Triggers `onStart` callback on first update
   * - Calls `strategy.update()` each frame
   * - When `isFinished()` returns true:
   *   - Calls `strategy.onFinished()` if defined
   *   - Triggers `onComplete` callback
   *   - Resolves the Promise returned by `add()`
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
        const strategyEntry = strategies[i];
        if (!strategyEntry) {
          continue;
        }

        const { strategy, options, resolve } = strategyEntry;

        // Trigger onStart on first update
        if (!strategyEntry.started) {
          strategyEntry.started = true;
          options?.onStart?.();
        }

        strategy.update(body, dt);

        const isFinished = strategy.isFinished?.();

        if (isFinished) {
          strategies.splice(i, 1);
          
          // Call strategy's own onFinished callback
          strategy.onFinished?.();
          
          // Call options onComplete callback
          options?.onComplete?.();
          
          // Resolve the Promise
          resolve?.();
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

