/**
 * Perlin Noise 2D Generator
 * 
 * A simple, efficient, and performant implementation of 2D Perlin noise.
 * Perlin noise generates smooth, natural-looking random values that are coherent
 * across space, making it ideal for procedural generation and smooth random movements.
 * 
 * ## Features
 * - **Deterministic**: Same seed and coordinates always produce the same value
 * - **Smooth**: Values change gradually, creating natural-looking patterns
 * - **Performant**: Optimized for real-time use in movement systems
 * - **Seeded**: Optional seed for reproducible results
 * 
 * ## Usage
 * ```ts
 * const noise = new PerlinNoise2D();
 * const value = noise.get(x, y); // Returns value between -1 and 1
 * 
 * // With seed for deterministic results
 * const seededNoise = new PerlinNoise2D(12345);
 * ```
 * 
 * @example
 * ```ts
 * // Use in movement system for smooth random directions
 * const noise = new PerlinNoise2D();
 * const time = Date.now() * 0.001;
 * const direction = Math.floor(noise.get(player.x(), player.y(), time) * 4) % 4;
 * ```
 */
export class PerlinNoise2D {
  private readonly permutation: number[];
  private readonly p: number[];

  /**
   * Creates a new Perlin noise generator
   * 
   * @param seed - Optional seed for deterministic noise generation. If not provided, uses a default seed.
   * 
   * @example
   * ```ts
   * const noise = new PerlinNoise2D(12345);
   * const value = noise.get(10, 20);
   * ```
   */
  constructor(seed: number = 0) {
    // Create permutation table (256 values)
    this.permutation = this.generatePermutation(seed);
    
    // Double the permutation array for easier wrapping
    this.p = [...this.permutation, ...this.permutation];
  }

  /**
   * Generates a permutation table based on seed
   * 
   * @param seed - Seed value for permutation generation
   * @returns Array of 256 shuffled values
   */
  private generatePermutation(seed: number): number[] {
    const p: number[] = [];
    
    // Initialize with sequential values
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    
    // Simple seeded shuffle using linear congruential generator
    let state = seed;
    const lcg = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state;
    };
    
    // Fisher-Yates shuffle with seeded random
    for (let i = 255; i > 0; i--) {
      const j = lcg() % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    
    return p;
  }

  /**
   * Fade function for smooth interpolation (ease curve)
   * 
   * @param t - Value between 0 and 1
   * @returns Smoothed value between 0 and 1
   */
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /**
   * Linear interpolation
   * 
   * @param a - Start value
   * @param b - End value
   * @param t - Interpolation factor (0 to 1)
   * @returns Interpolated value
   */
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  /**
   * Gradient function - generates a pseudo-random gradient vector
   * 
   * @param hash - Hash value from permutation table
   * @param x - X component
   * @param y - Y component
   * @returns Dot product of gradient and position
   */
  private grad(hash: number, x: number, y: number): number {
    // Convert hash to one of 4 gradient directions
    const h = hash & 3;
    
    // Return dot product with gradient vector
    switch (h) {
      case 0: return x + y;      // (1, 1)
      case 1: return -x + y;     // (-1, 1)
      case 2: return x - y;      // (1, -1)
      case 3: return -x - y;     // (-1, -1)
      default: return 0;
    }
  }

  /**
   * Gets the noise value at the specified 2D coordinates
   * 
   * Returns a value between approximately -1 and 1, though values near the edges
   * are less common. For practical use, you may want to clamp or normalize the result.
   * 
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param scale - Optional scale factor (default: 0.1). Lower values create smoother, larger patterns.
   * @returns Noise value between approximately -1 and 1
   * 
   * @example
   * ```ts
   * const noise = new PerlinNoise2D();
   * const value = noise.get(10, 20); // Basic usage
   * const scaled = noise.get(10, 20, 0.05); // Smoother pattern
   * ```
   */
  get(x: number, y: number, scale: number = 0.1): number {
    // Apply scale
    x *= scale;
    y *= scale;

    // Find unit grid cell containing point
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    // Get relative x,y coordinates within that cell
    x -= Math.floor(x);
    y -= Math.floor(y);

    // Compute fade curves for x and y
    const u = this.fade(x);
    const v = this.fade(y);

    // Hash coordinates of the 4 square corners
    const A = this.p[X] + Y;
    const AA = this.p[A];
    const AB = this.p[A + 1];
    const B = this.p[X + 1] + Y;
    const BA = this.p[B];
    const BB = this.p[B + 1];

    // And add blended results from 4 corners of the square
    return this.lerp(
      this.lerp(
        this.grad(this.p[AA], x, y),
        this.grad(this.p[BA], x - 1, y),
        u
      ),
      this.lerp(
        this.grad(this.p[AB], x, y - 1),
        this.grad(this.p[BB], x - 1, y - 1),
        u
      ),
      v
    );
  }

  /**
   * Gets a normalized noise value between 0 and 1
   * 
   * Convenience method that normalizes the noise output to a 0-1 range.
   * 
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param scale - Optional scale factor (default: 0.1)
   * @returns Noise value between 0 and 1
   * 
   * @example
   * ```ts
   * const noise = new PerlinNoise2D();
   * const normalized = noise.getNormalized(10, 20);
   * // Returns value between 0 and 1
   * ```
   */
  getNormalized(x: number, y: number, scale: number = 0.1): number {
    return (this.get(x, y, scale) + 1) * 0.5;
  }

  /**
   * Gets a noise value mapped to a specific range
   * 
   * Maps the noise output to a custom min-max range.
   * 
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param min - Minimum output value
   * @param max - Maximum output value
   * @param scale - Optional scale factor (default: 0.1)
   * @returns Noise value between min and max
   * 
   * @example
   * ```ts
   * const noise = new PerlinNoise2D();
   * const direction = noise.getRange(10, 20, 0, 3); // Returns 0, 1, 2, or 3
   * ```
   */
  getRange(x: number, y: number, min: number, max: number, scale: number = 0.1): number {
    const normalized = this.getNormalized(x, y, scale);
    return min + normalized * (max - min);
  }

  /**
   * Gets an integer noise value in a specific range (inclusive)
   * 
   * Useful for selecting discrete values like array indices or enum values.
   * 
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param min - Minimum integer value (inclusive)
   * @param max - Maximum integer value (inclusive)
   * @param scale - Optional scale factor (default: 0.1)
   * @returns Integer noise value between min and max (inclusive)
   * 
   * @example
   * ```ts
   * const noise = new PerlinNoise2D();
   * const directionIndex = noise.getInt(10, 20, 0, 3); // Returns 0, 1, 2, or 3
   * ```
   */
  getInt(x: number, y: number, min: number, max: number, scale: number = 0.1): number {
    const value = this.getRange(x, y, min, max + 1, scale);
    return Math.floor(value);
  }
}

/**
 * Creates a shared Perlin noise instance for global use
 * 
 * Useful when you want consistent noise across different parts of your application
 * without passing the instance around.
 * 
 * @param seed - Optional seed for the shared instance
 * @returns Shared PerlinNoise2D instance
 * 
 * @example
 * ```ts
 * const noise = getSharedPerlinNoise(12345);
 * const value = noise.get(10, 20);
 * ```
 */
let sharedInstance: PerlinNoise2D | null = null;

export function getSharedPerlinNoise(seed?: number): PerlinNoise2D {
  if (!sharedInstance) {
    sharedInstance = new PerlinNoise2D(seed);
  }
  return sharedInstance;
}

/**
 * Resets the shared Perlin noise instance
 * 
 * Useful for testing or when you need to change the seed.
 * 
 * @param seed - Optional new seed for the instance
 * 
 * @example
 * ```ts
 * resetSharedPerlinNoise(12345);
 * ```
 */
export function resetSharedPerlinNoise(seed?: number): void {
  sharedInstance = new PerlinNoise2D(seed);
}

