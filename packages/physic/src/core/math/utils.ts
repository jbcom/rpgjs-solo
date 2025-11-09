import { Vector2 } from './Vector2';
import { AABB } from './AABB';

/**
 * Geometric utility functions
 * 
 * Collection of deterministic geometric operations for 2D physics.
 */

/**
 * Tolerance for floating-point comparisons
 */
export const EPSILON = 1e-5;

/**
 * Checks if two numbers are approximately equal
 * 
 * @param a - First number
 * @param b - Second number
 * @param epsilon - Tolerance (default: EPSILON)
 * @returns True if numbers are approximately equal
 * 
 * @example
 * ```typescript
 * approximatelyEqual(0.1 + 0.2, 0.3); // true
 * ```
 */
export function approximatelyEqual(a: number, b: number, epsilon = EPSILON): boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * Clamps a value between min and max
 * 
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 * 
 * @example
 * ```typescript
 * clamp(15, 0, 10); // 10
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linearly interpolates between two values
 * 
 * @param a - Start value
 * @param b - End value
 * @param t - Interpolation factor (0 to 1)
 * @returns Interpolated value
 * 
 * @example
 * ```typescript
 * lerp(0, 10, 0.5); // 5
 * ```
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Calculates the distance between two points
 * 
 * @param x1 - First point X
 * @param y1 - First point Y
 * @param x2 - Second point X
 * @param y2 - Second point Y
 * @returns Distance
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates the squared distance between two points (faster, avoids sqrt)
 * 
 * @param x1 - First point X
 * @param y1 - First point Y
 * @param x2 - Second point X
 * @param y2 - Second point Y
 * @returns Squared distance
 */
export function distanceSquared(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/**
 * Calculates the angle between two points in radians
 * 
 * @param x1 - First point X
 * @param y1 - First point Y
 * @param x2 - Second point X
 * @param y2 - Second point Y
 * @returns Angle in radians
 */
export function angleBetween(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1);
}

/**
 * Normalizes an angle to the range [-π, π]
 * 
 * @param angle - Angle in radians
 * @returns Normalized angle
 * 
 * @example
 * ```typescript
 * normalizeAngle(Math.PI * 3); // -Math.PI
 * ```
 */
export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) {
    angle -= 2 * Math.PI;
  }
  while (angle < -Math.PI) {
    angle += 2 * Math.PI;
  }
  return angle;
}

/**
 * Calculates the shortest angular distance between two angles
 * 
 * @param from - Start angle in radians
 * @param to - End angle in radians
 * @returns Shortest angular distance in radians
 */
export function angularDistance(from: number, to: number): number {
  let diff = to - from;
  while (diff > Math.PI) {
    diff -= 2 * Math.PI;
  }
  while (diff < -Math.PI) {
    diff += 2 * Math.PI;
  }
  return diff;
}

/**
 * Projects a point onto a line segment
 * 
 * @param point - Point to project
 * @param lineStart - Line segment start point
 * @param lineEnd - Line segment end point
 * @returns Projected point on the line segment
 */
export function projectPointOnLineSegment(
  point: Vector2,
  lineStart: Vector2,
  lineEnd: Vector2
): Vector2 {
  const line = lineEnd.sub(lineStart);
  const pointVec = point.sub(lineStart);
  const lineLengthSq = line.lengthSquared();
  
  if (lineLengthSq < EPSILON) {
    return lineStart.clone();
  }
  
  const t = clamp(pointVec.dot(line) / lineLengthSq, 0, 1);
  return lineStart.add(line.mul(t));
}

/**
 * Calculates the closest point on an AABB to a given point
 * 
 * @param point - Point to find closest point for
 * @param aabb - AABB to check against
 * @returns Closest point on the AABB
 */
export function closestPointOnAABB(point: Vector2, aabb: AABB): Vector2 {
  return new Vector2(
    clamp(point.x, aabb.minX, aabb.maxX),
    clamp(point.y, aabb.minY, aabb.maxY)
  );
}

/**
 * Checks if a point is inside a circle
 * 
 * @param point - Point to check
 * @param center - Circle center
 * @param radius - Circle radius
 * @returns True if point is inside the circle
 */
export function pointInCircle(point: Vector2, center: Vector2, radius: number): boolean {
  return point.distanceToSquared(center) <= radius * radius;
}

/**
 * Converts degrees to radians
 * 
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 */
export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees
 * 
 * @param radians - Angle in radians
 * @returns Angle in degrees
 */
export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

