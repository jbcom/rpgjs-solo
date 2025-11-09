import { describe, it, expect } from 'vitest';
import { AABB } from './AABB';
import { Vector2 } from './Vector2';

describe('AABB', () => {
  it('should create an AABB', () => {
    const aabb = new AABB(0, 0, 10, 10);
    expect(aabb.minX).toBe(0);
    expect(aabb.minY).toBe(0);
    expect(aabb.maxX).toBe(10);
    expect(aabb.maxY).toBe(10);
  });

  it('should create AABB from center and size', () => {
    const aabb = AABB.fromCenterSize(5, 5, 10, 10);
    expect(aabb.minX).toBe(0);
    expect(aabb.minY).toBe(0);
    expect(aabb.maxX).toBe(10);
    expect(aabb.maxY).toBe(10);
  });

  it('should get width and height', () => {
    const aabb = new AABB(0, 0, 10, 20);
    expect(aabb.getWidth()).toBe(10);
    expect(aabb.getHeight()).toBe(20);
  });

  it('should get center', () => {
    const aabb = new AABB(0, 0, 10, 10);
    const center = aabb.getCenter();
    expect(center.x).toBe(5);
    expect(center.y).toBe(5);
  });

  it('should check if point is inside', () => {
    const aabb = new AABB(0, 0, 10, 10);
    expect(aabb.containsPoint(5, 5)).toBe(true);
    expect(aabb.containsPoint(15, 15)).toBe(false);
  });

  it('should check intersection', () => {
    const aabb1 = new AABB(0, 0, 10, 10);
    const aabb2 = new AABB(5, 5, 15, 15);
    expect(aabb1.intersects(aabb2)).toBe(true);
  });

  it('should calculate intersection', () => {
    const aabb1 = new AABB(0, 0, 10, 10);
    const aabb2 = new AABB(5, 5, 15, 15);
    const intersection = aabb1.intersection(aabb2);
    expect(intersection).not.toBeNull();
    expect(intersection!.minX).toBe(5);
    expect(intersection!.minY).toBe(5);
    expect(intersection!.maxX).toBe(10);
    expect(intersection!.maxY).toBe(10);
  });

  it('should expand AABB', () => {
    const aabb = new AABB(0, 0, 10, 10);
    const expanded = aabb.expand(5);
    expect(expanded.minX).toBe(-5);
    expect(expanded.minY).toBe(-5);
    expect(expanded.maxX).toBe(15);
    expect(expanded.maxY).toBe(15);
  });
});

