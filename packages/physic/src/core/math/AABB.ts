import { Vector2 } from './Vector2';

/**
 * Axis-Aligned Bounding Box (AABB)
 * 
 * Represents a rectangular bounding box aligned with the coordinate axes.
 * Used for fast collision detection and spatial queries.
 * 
 * @example
 * ```typescript
 * const box = new AABB(0, 0, 10, 10);
 * const point = new Vector2(5, 5);
 * if (box.contains(point)) {
 *   // Point is inside the box
 * }
 * ```
 */
export class AABB {
  /**
   * Minimum X coordinate (left edge)
   */
  public minX: number;

  /**
   * Minimum Y coordinate (bottom edge)
   */
  public minY: number;

  /**
   * Maximum X coordinate (right edge)
   */
  public maxX: number;

  /**
   * Maximum Y coordinate (top edge)
   */
  public maxY: number;

  /**
   * Creates a new AABB
   * 
   * @param minX - Minimum X coordinate
   * @param minY - Minimum Y coordinate
   * @param maxX - Maximum X coordinate
   * @param maxY - Maximum Y coordinate
   */
  constructor(minX: number, minY: number, maxX: number, maxY: number) {
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
  }

  /**
   * Creates an AABB from center and size
   * 
   * @param centerX - Center X coordinate
   * @param centerY - Center Y coordinate
   * @param width - Width of the box
   * @param height - Height of the box
   * @returns New AABB
   */
  static fromCenterSize(
    centerX: number,
    centerY: number,
    width: number,
    height: number
  ): AABB {
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    return new AABB(
      centerX - halfWidth,
      centerY - halfHeight,
      centerX + halfWidth,
      centerY + halfHeight
    );
  }

  /**
   * Creates an AABB from a center point and size
   * 
   * @param center - Center point
   * @param width - Width of the box
   * @param height - Height of the box
   * @returns New AABB
   */
  static fromCenterSizeVector(center: Vector2, width: number, height: number): AABB {
    return AABB.fromCenterSize(center.x, center.y, width, height);
  }

  /**
   * Creates a copy of this AABB
   * 
   * @returns New AABB with the same values
   */
  public clone(): AABB {
    return new AABB(this.minX, this.minY, this.maxX, this.maxY);
  }

  /**
   * Copies values from another AABB
   * 
   * @param other - AABB to copy from
   * @returns This AABB for chaining
   */
  public copyFrom(other: AABB): AABB {
    this.minX = other.minX;
    this.minY = other.minY;
    this.maxX = other.maxX;
    this.maxY = other.maxY;
    return this;
  }

  /**
   * Gets the width of the AABB
   * 
   * @returns Width
   */
  public getWidth(): number {
    return this.maxX - this.minX;
  }

  /**
   * Gets the height of the AABB
   * 
   * @returns Height
   */
  public getHeight(): number {
    return this.maxY - this.minY;
  }

  /**
   * Gets the center point of the AABB
   * 
   * @returns Center point
   */
  public getCenter(): Vector2 {
    return new Vector2(
      (this.minX + this.maxX) / 2,
      (this.minY + this.maxY) / 2
    );
  }

  /**
   * Gets the center X coordinate
   * 
   * @returns Center X
   */
  public getCenterX(): number {
    return (this.minX + this.maxX) / 2;
  }

  /**
   * Gets the center Y coordinate
   * 
   * @returns Center Y
   */
  public getCenterY(): number {
    return (this.minY + this.maxY) / 2;
  }

  /**
   * Gets the area of the AABB
   * 
   * @returns Area
   */
  public getArea(): number {
    return this.getWidth() * this.getHeight();
  }

  /**
   * Checks if a point is inside this AABB
   * 
   * @param x - Point X coordinate
   * @param y - Point Y coordinate
   * @returns True if point is inside
   */
  public containsPoint(x: number, y: number): boolean {
    return x >= this.minX && x <= this.maxX && y >= this.minY && y <= this.maxY;
  }

  /**
   * Checks if a vector point is inside this AABB
   * 
   * @param point - Point to check
   * @returns True if point is inside
   */
  public contains(point: Vector2): boolean {
    return this.containsPoint(point.x, point.y);
  }

  /**
   * Checks if another AABB is completely inside this AABB
   * 
   * @param other - AABB to check
   * @returns True if other AABB is inside
   */
  public containsAABB(other: AABB): boolean {
    return (
      this.minX <= other.minX &&
      this.minY <= other.minY &&
      this.maxX >= other.maxX &&
      this.maxY >= other.maxY
    );
  }

  /**
   * Checks if this AABB intersects with another AABB
   * 
   * @param other - AABB to check intersection with
   * @returns True if AABBs intersect
   */
  public intersects(other: AABB): boolean {
    return !(
      this.maxX < other.minX ||
      this.minX > other.maxX ||
      this.maxY < other.minY ||
      this.minY > other.maxY
    );
  }

  /**
   * Calculates the intersection AABB with another AABB
   * 
   * @param other - AABB to intersect with
   * @returns Intersection AABB, or null if no intersection
   */
  public intersection(other: AABB): AABB | null {
    if (!this.intersects(other)) {
      return null;
    }
    return new AABB(
      Math.max(this.minX, other.minX),
      Math.max(this.minY, other.minY),
      Math.min(this.maxX, other.maxX),
      Math.min(this.maxY, other.maxY)
    );
  }

  /**
   * Calculates the union AABB with another AABB
   * 
   * @param other - AABB to union with
   * @returns Union AABB
   */
  public union(other: AABB): AABB {
    return new AABB(
      Math.min(this.minX, other.minX),
      Math.min(this.minY, other.minY),
      Math.max(this.maxX, other.maxX),
      Math.max(this.maxY, other.maxY)
    );
  }

  /**
   * Expands this AABB by a given amount in all directions
   * 
   * @param amount - Amount to expand by
   * @returns New expanded AABB
   */
  public expand(amount: number): AABB {
    return new AABB(
      this.minX - amount,
      this.minY - amount,
      this.maxX + amount,
      this.maxY + amount
    );
  }

  /**
   * Expands this AABB by a given amount (in-place)
   * 
   * @param amount - Amount to expand by
   * @returns This AABB for chaining
   */
  public expandInPlace(amount: number): AABB {
    this.minX -= amount;
    this.minY -= amount;
    this.maxX += amount;
    this.maxY += amount;
    return this;
  }

  /**
   * Translates this AABB by a given offset
   * 
   * @param dx - X offset
   * @param dy - Y offset
   * @returns New translated AABB
   */
  public translate(dx: number, dy: number): AABB {
    return new AABB(
      this.minX + dx,
      this.minY + dy,
      this.maxX + dx,
      this.maxY + dy
    );
  }

  /**
   * Translates this AABB by a given offset (in-place)
   * 
   * @param dx - X offset
   * @param dy - Y offset
   * @returns This AABB for chaining
   */
  public translateInPlace(dx: number, dy: number): AABB {
    this.minX += dx;
    this.minY += dy;
    this.maxX += dx;
    this.maxY += dy;
    return this;
  }

  /**
   * Checks if this AABB equals another (with epsilon tolerance)
   * 
   * @param other - AABB to compare
   * @param epsilon - Tolerance for comparison (default: 1e-5)
   * @returns True if AABBs are approximately equal
   */
  public equals(other: AABB, epsilon = 1e-5): boolean {
    return (
      Math.abs(this.minX - other.minX) < epsilon &&
      Math.abs(this.minY - other.minY) < epsilon &&
      Math.abs(this.maxX - other.maxX) < epsilon &&
      Math.abs(this.maxY - other.maxY) < epsilon
    );
  }

  /**
   * Returns a string representation of this AABB
   * 
   * @returns String representation
   */
  public toString(): string {
    return `AABB(${this.minX}, ${this.minY}, ${this.maxX}, ${this.maxY})`;
  }
}

