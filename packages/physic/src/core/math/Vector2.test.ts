import { describe, it, expect } from 'vitest';
import { Vector2 } from './Vector2';

describe('Vector2', () => {
  it('should create a vector with default values', () => {
    const v = new Vector2();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('should create a vector with specified values', () => {
    const v = new Vector2(1, 2);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
  });

  it('should clone a vector', () => {
    const v1 = new Vector2(1, 2);
    const v2 = v1.clone();
    expect(v2.x).toBe(1);
    expect(v2.y).toBe(2);
    expect(v2).not.toBe(v1);
  });

  it('should add vectors', () => {
    const v1 = new Vector2(1, 2);
    const v2 = new Vector2(3, 4);
    const result = v1.add(v2);
    expect(result.x).toBe(4);
    expect(result.y).toBe(6);
  });

  it('should subtract vectors', () => {
    const v1 = new Vector2(5, 5);
    const v2 = new Vector2(2, 3);
    const result = v1.sub(v2);
    expect(result.x).toBe(3);
    expect(result.y).toBe(2);
  });

  it('should calculate dot product', () => {
    const v1 = new Vector2(1, 2);
    const v2 = new Vector2(3, 4);
    expect(v1.dot(v2)).toBe(11); // 1*3 + 2*4 = 11
  });

  it('should calculate length', () => {
    const v = new Vector2(3, 4);
    expect(v.length()).toBe(5); // 3-4-5 triangle
  });

  it('should normalize a vector', () => {
    const v = new Vector2(3, 4);
    const normalized = v.normalize();
    expect(normalized.length()).toBeCloseTo(1, 5);
  });

  it('should calculate distance between vectors', () => {
    const v1 = new Vector2(0, 0);
    const v2 = new Vector2(3, 4);
    expect(v1.distanceTo(v2)).toBe(5);
  });
});

