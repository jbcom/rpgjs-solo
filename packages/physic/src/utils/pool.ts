/**
 * Object pool for efficient memory management
 * 
 * Reuses objects to avoid garbage collection during simulation.
 * 
 * @example
 * ```typescript
 * const pool = new ObjectPool(() => new Vector2(), 10);
 * const vec = pool.acquire();
 * // ... use vec ...
 * pool.release(vec);
 * ```
 */
export class ObjectPool<T> {
  private createFn: () => T;
  private resetFn: ((obj: T) => void) | undefined;
  private pool: T[] = [];
  private maxSize: number;

  /**
   * Creates a new object pool
   * 
   * @param createFn - Function to create new objects
   * @param maxSize - Maximum pool size (default: 100)
   * @param resetFn - Optional function to reset objects before reuse
   */
  constructor(createFn: () => T, maxSize = 100, resetFn?: (obj: T) => void) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  /**
   * Acquires an object from the pool
   * 
   * @returns Object from pool or newly created
   */
  public acquire(): T {
    if (this.pool.length > 0) {
      const obj = this.pool.pop()!;
      if (this.resetFn) {
        this.resetFn(obj);
      }
      return obj;
    }
    return this.createFn();
  }

  /**
   * Releases an object back to the pool
   * 
   * @param obj - Object to release
   */
  public release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.pool.push(obj);
    }
  }

  /**
   * Clears the pool
   */
  public clear(): void {
    this.pool.length = 0;
  }

  /**
   * Gets the current pool size
   * 
   * @returns Number of objects in pool
   */
  public size(): number {
    return this.pool.length;
  }
}

