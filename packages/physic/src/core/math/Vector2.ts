/**
 * 2D Vector class with deterministic operations
 * 
 * All operations are designed to be deterministic and avoid floating-point
 * precision issues. Methods support both in-place mutations and immutable operations.
 * 
 * @example
 * ```typescript
 * const v1 = new Vector2(1, 2);
 * const v2 = new Vector2(3, 4);
 * const sum = v1.add(v2); // Returns new vector (4, 6)
 * v1.addInPlace(v2); // Mutates v1 to (4, 6)
 * ```
 */
export class Vector2 {
  /**
   * X component
   */
  public x: number;

  /**
   * Y component
   */
  public y: number;

  /**
   * Creates a new Vector2
   * 
   * @param x - X component (default: 0)
   * @param y - Y component (default: 0)
   */
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  /**
   * Creates a copy of this vector
   * 
   * @returns A new Vector2 with the same values
   */
  public clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  /**
   * Sets the components of this vector
   * 
   * @param x - X component
   * @param y - Y component
   * @returns This vector for chaining
   */
  public set(x: number, y: number): Vector2 {
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Copies values from another vector
   * 
   * @param other - Vector to copy from
   * @returns This vector for chaining
   */
  public copyFrom(other: Vector2): Vector2 {
    this.x = other.x;
    this.y = other.y;
    return this;
  }

  /**
   * Adds another vector to this vector (immutable)
   * 
   * @param other - Vector to add
   * @returns New vector with the result
   */
  public add(other: Vector2): Vector2 {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  /**
   * Adds another vector to this vector (in-place)
   * 
   * @param other - Vector to add
   * @returns This vector for chaining
   */
  public addInPlace(other: Vector2): Vector2 {
    this.x += other.x;
    this.y += other.y;
    return this;
  }

  /**
   * Subtracts another vector from this vector (immutable)
   * 
   * @param other - Vector to subtract
   * @returns New vector with the result
   */
  public sub(other: Vector2): Vector2 {
    return new Vector2(this.x - other.x, this.y - other.y);
  }

  /**
   * Subtracts another vector from this vector (in-place)
   * 
   * @param other - Vector to subtract
   * @returns This vector for chaining
   */
  public subInPlace(other: Vector2): Vector2 {
    this.x -= other.x;
    this.y -= other.y;
    return this;
  }

  /**
   * Multiplies this vector by a scalar (immutable)
   * 
   * @param scalar - Scalar value
   * @returns New vector with the result
   */
  public mul(scalar: number): Vector2 {
    return new Vector2(this.x * scalar, this.y * scalar);
  }

  /**
   * Multiplies this vector by a scalar (in-place)
   * 
   * @param scalar - Scalar value
   * @returns This vector for chaining
   */
  public mulInPlace(scalar: number): Vector2 {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  /**
   * Divides this vector by a scalar (immutable)
   * 
   * @param scalar - Scalar value (must not be zero)
   * @returns New vector with the result
   */
  public div(scalar: number): Vector2 {
    return new Vector2(this.x / scalar, this.y / scalar);
  }

  /**
   * Divides this vector by a scalar (in-place)
   * 
   * @param scalar - Scalar value (must not be zero)
   * @returns This vector for chaining
   */
  public divInPlace(scalar: number): Vector2 {
    this.x /= scalar;
    this.y /= scalar;
    return this;
  }

  /**
   * Calculates the dot product with another vector
   * 
   * @param other - Vector to dot with
   * @returns Dot product value
   */
  public dot(other: Vector2): number {
    return this.x * other.x + this.y * other.y;
  }

  /**
   * Calculates the 2D cross product (scalar result)
   * 
   * @param other - Vector to cross with
   * @returns Cross product value (z-component of 3D cross product)
   */
  public cross(other: Vector2): number {
    return this.x * other.y - this.y * other.x;
  }

  /**
   * Calculates the squared length (faster than length, avoids sqrt)
   * 
   * @returns Squared length
   */
  public lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  /**
   * Calculates the length (magnitude) of the vector
   * 
   * @returns Length
   */
  public length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  /**
   * Normalizes this vector to unit length (immutable)
   * 
   * @returns New normalized vector
   */
  public normalize(): Vector2 {
    const len = this.length();
    if (len === 0) {
      return new Vector2(0, 0);
    }
    return this.div(len);
  }

  /**
   * Normalizes this vector to unit length (in-place)
   * 
   * @returns This vector for chaining
   */
  public normalizeInPlace(): Vector2 {
    const len = this.length();
    if (len === 0) {
      this.x = 0;
      this.y = 0;
    } else {
      this.divInPlace(len);
    }
    return this;
  }

  /**
   * Calculates the distance to another vector
   * 
   * @param other - Target vector
   * @returns Distance
   */
  public distanceTo(other: Vector2): number {
    return this.sub(other).length();
  }

  /**
   * Calculates the squared distance to another vector (faster)
   * 
   * @param other - Target vector
   * @returns Squared distance
   */
  public distanceToSquared(other: Vector2): number {
    return this.sub(other).lengthSquared();
  }

  /**
   * Rotates this vector by an angle in radians (immutable)
   * 
   * @param angle - Angle in radians
   * @returns New rotated vector
   */
  public rotate(angle: number): Vector2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  /**
   * Rotates this vector by an angle in radians (in-place)
   * 
   * @param angle - Angle in radians
   * @returns This vector for chaining
   */
  public rotateInPlace(angle: number): Vector2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = this.x * cos - this.y * sin;
    const y = this.x * sin + this.y * cos;
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Calculates the angle of this vector in radians
   * 
   * @returns Angle in radians (range: -π to π)
   */
  public angle(): number {
    return Math.atan2(this.y, this.x);
  }

  /**
   * Linearly interpolates between this vector and another
   * 
   * @param other - Target vector
   * @param t - Interpolation factor (0 to 1)
   * @returns New interpolated vector
   */
  public lerp(other: Vector2, t: number): Vector2 {
    return new Vector2(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t
    );
  }

  /**
   * Checks if this vector equals another (with epsilon tolerance)
   * 
   * @param other - Vector to compare
   * @param epsilon - Tolerance for comparison (default: 1e-5)
   * @returns True if vectors are approximately equal
   */
  public equals(other: Vector2, epsilon = 1e-5): boolean {
    return (
      Math.abs(this.x - other.x) < epsilon &&
      Math.abs(this.y - other.y) < epsilon
    );
  }

  /**
   * Returns a string representation of this vector
   * 
   * @returns String representation
   */
  public toString(): string {
    return `Vector2(${this.x}, ${this.y})`;
  }

  /**
   * Static zero vector
   */
  static readonly ZERO = new Vector2(0, 0);

  /**
   * Static unit X vector
   */
  static readonly UNIT_X = new Vector2(1, 0);

  /**
   * Static unit Y vector
   */
  static readonly UNIT_Y = new Vector2(0, 1);
}

