import { describe, it, expect } from 'vitest';
import { Matrix2 } from './Matrix2';

describe('Matrix2', () => {
  it('should create identity matrix', () => {
    const m = Matrix2.identity();
    expect(m.m00).toBe(1);
    expect(m.m01).toBe(0);
    expect(m.m10).toBe(0);
    expect(m.m11).toBe(1);
  });

  it('should create rotation matrix', () => {
    const m = Matrix2.fromAngle(Math.PI / 2);
    const result = m.multiplyVector(1, 0);
    // Matrix rotation: [cos, sin, -sin, cos] = [0, 1, -1, 0] for PI/2
    // Result: (0*1 + 1*0, -1*1 + 0*0) = (0, -1)
    // This is correct for our matrix convention
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(-1, 5);
  });

  it('should multiply matrices', () => {
    const m1 = Matrix2.identity();
    const m2 = Matrix2.identity();
    const result = m1.multiply(m2);
    expect(result.m00).toBe(1);
    expect(result.m11).toBe(1);
  });

  it('should calculate determinant', () => {
    const m = new Matrix2(1, 2, 3, 4);
    expect(m.determinant()).toBe(-2); // 1*4 - 2*3 = -2
  });

  it('should transpose matrix', () => {
    const m = new Matrix2(1, 2, 3, 4);
    const transposed = m.transpose();
    expect(transposed.m00).toBe(1);
    expect(transposed.m01).toBe(3);
    expect(transposed.m10).toBe(2);
    expect(transposed.m11).toBe(4);
  });
});

