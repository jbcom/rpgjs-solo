import type { Entity } from '../physics/Entity';

/**
 * Options for movement strategies
 * 
 * Allows configuring callbacks that are triggered during the movement lifecycle.
 * These options can be passed when adding a strategy to the MovementManager.
 * 
 * @example
 * ```typescript
 * // Add a dash with callbacks
 * const promise = manager.add(player, new Dash(8, { x: 1, y: 0 }, 200), {
 *   onStart: () => {
 *     player.directionFixed = true;
 *     player.animationFixed = true;
 *   },
 *   onComplete: () => {
 *     player.directionFixed = false;
 *     player.animationFixed = false;
 *   }
 * });
 * 
 * // Wait for completion
 * await promise;
 * console.log('Dash completed!');
 * ```
 */
export interface MovementOptions {
  /**
   * Callback executed when the movement starts (first update call)
   */
  onStart?: () => void;

  /**
   * Callback executed when the movement completes (isFinished returns true)
   */
  onComplete?: () => void;
}

/**
 * Minimal interface implemented by elements that can receive movement updates.
 */
export interface MovementBody {
  /** Unique identifier of the controlled body */
  readonly id: string;
  /** Current position */
  readonly position: { x: number; y: number };
  /** Current velocity */
  readonly velocity: { x: number; y: number };
  /** Assigns a new velocity */
  setVelocity(velocity: { x: number; y: number }): void;
  /** Optional translation helper */
  translate?(delta: { x: number; y: number }): void;
  /** Optional static flag check */
  isStatic?(): boolean;
  /** Optional accessor to the underlying physics entity */
  getEntity?(): Entity | null;
}

/**
 * Interface describing a movement strategy applied to a body.
 *
 * A movement strategy encapsulates the logic required to update an entity's
 * velocity or position before the physics simulation step runs.
 *
 * @example
 * ```typescript
 * class ConstantVelocity implements MovementStrategy {
 *   constructor(private velocity: { x: number; y: number }) {}
 *
 *   update(body: MovementBody): void {
 *     body.setVelocity(this.velocity);
 *   }
 * }
 * ```
 */
export interface MovementStrategy {
  /**
   * Updates an entity before the physics step.
   *
   * The time delta is expressed in seconds and should match the physics engine
   * time step to ensure deterministic results.
   *
   * @param body - Body to update
   * @param dt - Time delta expressed in seconds
   */
  update(body: MovementBody, dt: number): void;

  /**
   * Returns true when the strategy has finished its work.
   * The movement manager will automatically remove completed strategies.
   */
  isFinished?(): boolean;

  /**
   * Optional callback executed after the strategy has been removed.
   * Useful to trigger chained behaviours.
   */
  onFinished?(): void;
}

