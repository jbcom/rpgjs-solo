import { describe, it, expect } from 'vitest';
import { SpatialHash } from './spatial-hash';
import { Entity } from '../physics/Entity';
import { AABB } from '../core/math/AABB';

describe('SpatialHash', () => {
  it('should insert entity', () => {
    const hash = new SpatialHash(10, 10);
    const entity = new Entity({ position: { x: 5, y: 5 }, radius: 2 });
    hash.insert(entity);
    const nearby = hash.query(entity);
    expect(nearby.size).toBe(0); // No other entities
  });

  it('should find nearby entities', () => {
    const hash = new SpatialHash(10, 10);
    const entity1 = new Entity({ position: { x: 5, y: 5 }, radius: 2 });
    const entity2 = new Entity({ position: { x: 6, y: 6 }, radius: 2 });
    hash.insert(entity1);
    hash.insert(entity2);

    const nearby = hash.query(entity1);
    expect(nearby.has(entity2)).toBe(true);
  });

  it('should update entity position', () => {
    const hash = new SpatialHash(10, 10);
    const entity = new Entity({ position: { x: 5, y: 5 }, radius: 2 });
    hash.insert(entity);

    entity.position.set(15, 15);
    hash.update(entity);

    const nearby = hash.query(entity);
    expect(nearby.size).toBe(0);
  });

  it('should query AABB', () => {
    const hash = new SpatialHash(10, 10);
    const entity1 = new Entity({ position: { x: 5, y: 5 }, radius: 2 });
    const entity2 = new Entity({ position: { x: 50, y: 50 }, radius: 2 });
    hash.insert(entity1);
    hash.insert(entity2);

    const bounds = new AABB(0, 0, 10, 10);
    const results = hash.queryAABB(bounds);
    expect(results.has(entity1)).toBe(true);
    expect(results.has(entity2)).toBe(false);
  });
});

