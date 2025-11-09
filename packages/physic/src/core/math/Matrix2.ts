/**
 * 2x2 Matrix class for 2D rotations and transformations
 * 
 * Used for rotating vectors and handling 2D transformations.
 * All operations are deterministic.
 * 
 * @example
 * ```typescript
 * const rotation = Matrix2.fromAngle(Math.PI / 4);
 * const rotated = rotation.multiplyVector(new Vector2(1, 0));
 * ```
 */
export class Matrix2 {
  /**
   * Matrix elements in column-major order:
   * [m00, m10]
   * [m01, m11]
   */
  public m00: number;
  public m01: number;
  public m10: number;
  public m11: number;

  /**
   * Creates a new 2x2 matrix
   * 
   * @param m00 - Element at row 0, column 0
   * @param m01 - Element at row 0, column 1
   * @param m10 - Element at row 1, column 0
   * @param m11 - Element at row 1, column 1
   */
  constructor(m00 = 1, m01 = 0, m10 = 0, m11 = 1) {
    this.m00 = m00;
    this.m01 = m01;
    this.m10 = m10;
    this.m11 = m11;
  }

  /**
   * Creates an identity matrix
   * 
   * @returns Identity matrix
   */
  static identity(): Matrix2 {
    return new Matrix2(1, 0, 0, 1);
  }

  /**
   * Creates a rotation matrix from an angle
   * 
   * @param angle - Rotation angle in radians
   * @returns Rotation matrix
   */
  static fromAngle(angle: number): Matrix2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Matrix2(cos, sin, -sin, cos);
  }

  /**
   * Creates a copy of this matrix
   * 
   * @returns New matrix with the same values
   */
  public clone(): Matrix2 {
    return new Matrix2(this.m00, this.m01, this.m10, this.m11);
  }

  /**
   * Copies values from another matrix
   * 
   * @param other - Matrix to copy from
   * @returns This matrix for chaining
   */
  public copyFrom(other: Matrix2): Matrix2 {
    this.m00 = other.m00;
    this.m01 = other.m01;
    this.m10 = other.m10;
    this.m11 = other.m11;
    return this;
  }

  /**
   * Multiplies this matrix by another matrix
   * 
   * @param other - Matrix to multiply with
   * @returns New matrix with the result
   */
  public multiply(other: Matrix2): Matrix2 {
    return new Matrix2(
      this.m00 * other.m00 + this.m01 * other.m10,
      this.m00 * other.m01 + this.m01 * other.m11,
      this.m10 * other.m00 + this.m11 * other.m10,
      this.m10 * other.m01 + this.m11 * other.m11
    );
  }

  /**
   * Multiplies this matrix by another matrix (in-place)
   * 
   * @param other - Matrix to multiply with
   * @returns This matrix for chaining
   */
  public multiplyInPlace(other: Matrix2): Matrix2 {
    const m00 = this.m00 * other.m00 + this.m01 * other.m10;
    const m01 = this.m00 * other.m01 + this.m01 * other.m11;
    const m10 = this.m10 * other.m00 + this.m11 * other.m10;
    const m11 = this.m10 * other.m01 + this.m11 * other.m11;
    
    this.m00 = m00;
    this.m01 = m01;
    this.m10 = m10;
    this.m11 = m11;
    return this;
  }

  /**
   * Multiplies a vector by this matrix (transforms the vector)
   * 
   * @param x - Vector X component
   * @param y - Vector Y component
   * @returns Object with transformed x and y
   */
  public multiplyVector(x: number, y: number): { x: number; y: number } {
    return {
      x: this.m00 * x + this.m01 * y,
      y: this.m10 * x + this.m11 * y,
    };
  }

  /**
   * Calculates the determinant of this matrix
   * 
   * @returns Determinant value
   */
  public determinant(): number {
    return this.m00 * this.m11 - this.m01 * this.m10;
  }

  /**
   * Calculates the inverse of this matrix
   * 
   * @returns New inverted matrix
   * @throws Error if matrix is singular (determinant is zero)
   */
  public inverse(): Matrix2 {
    const det = this.determinant();
    if (Math.abs(det) < 1e-10) {
      throw new Error('Matrix is singular and cannot be inverted');
    }
    const invDet = 1 / det;
    return new Matrix2(
      this.m11 * invDet,
      -this.m01 * invDet,
      -this.m10 * invDet,
      this.m00 * invDet
    );
  }

  /**
   * Transposes this matrix
   * 
   * @returns New transposed matrix
   */
  public transpose(): Matrix2 {
    return new Matrix2(this.m00, this.m10, this.m01, this.m11);
  }

  /**
   * Sets this matrix to a rotation matrix
   * 
   * @param angle - Rotation angle in radians
   * @returns This matrix for chaining
   */
  public setRotation(angle: number): Matrix2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.m00 = cos;
    this.m01 = sin;
    this.m10 = -sin;
    this.m11 = cos;
    return this;
  }

  /**
   * Extracts the rotation angle from this matrix
   * 
   * @returns Rotation angle in radians
   */
  public getAngle(): number {
    return Math.atan2(this.m01, this.m00);
  }

  /**
   * Checks if this matrix equals another (with epsilon tolerance)
   * 
   * @param other - Matrix to compare
   * @param epsilon - Tolerance for comparison (default: 1e-5)
   * @returns True if matrices are approximately equal
   */
  public equals(other: Matrix2, epsilon = 1e-5): boolean {
    return (
      Math.abs(this.m00 - other.m00) < epsilon &&
      Math.abs(this.m01 - other.m01) < epsilon &&
      Math.abs(this.m10 - other.m10) < epsilon &&
      Math.abs(this.m11 - other.m11) < epsilon
    );
  }

  /**
   * Returns a string representation of this matrix
   * 
   * @returns String representation
   */
  public toString(): string {
    return `Matrix2([${this.m00}, ${this.m01}], [${this.m10}, ${this.m11}])`;
  }
}

