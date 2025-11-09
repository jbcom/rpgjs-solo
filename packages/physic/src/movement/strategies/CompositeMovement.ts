import { MovementBody, MovementStrategy } from '../MovementStrategy';

/**
 * Aggregates multiple strategies either in parallel or in sequence.
 *
 * Parallel mode applies all strategies on the same frame; sequence mode runs
 * them one after another.
 *
 * @example
 * ```typescript
 * const composite = new CompositeMovement('parallel', [
 *   new LinearMove({ x: 2, y: 0 }),
 *   new Oscillate({ x: 0, y: 1 }, 1, 2),
 * ]);
 * movementManager.add(entity, composite);
 * ```
 */
export class CompositeMovement implements MovementStrategy {
  private currentIndex = 0;

  /**
   * Creates a composite movement.
   *
   * @param mode - Parallel or sequence execution
   * @param strategies - Strategies to aggregate
   */
  constructor(
    private readonly mode: 'parallel' | 'sequence',
    private readonly strategies: MovementStrategy[],
  ) {}

  update(body: MovementBody, dt: number): void {
    if (this.strategies.length === 0) {
      return;
    }

    if (this.mode === 'parallel') {
      this.updateParallel(body, dt);
    } else {
      this.updateSequence(body, dt);
    }
  }

  isFinished(): boolean {
    if (this.mode === 'parallel') {
      return this.strategies.length === 0;
    }
    return this.currentIndex >= this.strategies.length;
  }

  add(strategy: MovementStrategy): void {
    this.strategies.push(strategy);
  }

  remove(strategy: MovementStrategy): boolean {
    const index = this.strategies.indexOf(strategy);
    if (index === -1) {
      return false;
    }
    this.strategies.splice(index, 1);
    if (this.currentIndex >= this.strategies.length) {
      this.currentIndex = Math.max(0, this.strategies.length - 1);
    }
    return true;
  }

  reset(): void {
    this.currentIndex = 0;
  }

  private updateParallel(body: MovementBody, dt: number): void {
    const originalVelocity = { x: body.velocity.x, y: body.velocity.y };
    let changes = 0;

    for (let i = this.strategies.length - 1; i >= 0; i -= 1) {
      const strategy = this.strategies[i];
      if (!strategy) {
        continue;
      }
      const beforeX = body.velocity.x;
      const beforeY = body.velocity.y;

      strategy.update(body, dt);

      if (beforeX !== body.velocity.x || beforeY !== body.velocity.y) {
        changes += 1;
      }

      if (strategy.isFinished?.()) {
        this.strategies.splice(i, 1);
        strategy.onFinished?.();
      }
    }

    if (changes > 1) {
      body.setVelocity({
        x: (body.velocity.x + originalVelocity.x) / 2,
        y: (body.velocity.y + originalVelocity.y) / 2,
      });
    }
  }

  private updateSequence(body: MovementBody, dt: number): void {
    if (this.currentIndex >= this.strategies.length) {
      return;
    }

    const current = this.strategies[this.currentIndex];
    if (!current) {
      return;
    }
    current.update(body, dt);

    if (current.isFinished?.()) {
      current.onFinished?.();
      this.currentIndex += 1;
    }
  }
}

