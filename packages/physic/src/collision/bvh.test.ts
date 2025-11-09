import { describe, it, expect } from 'vitest';
import { BVH } from './bvh';
import { AABB } from '../core/math/AABB';
import { Entity } from '../physics/Entity';

describe('BVH', () => {
  it('inserts and queries entities', () => {
    const bvh = new BVH();
    const e1 = new Entity({ position: { x: 0, y: 0 }, radius: 1 });
    const e2 = new Entity({ position: { x: 1, y: 0 }, radius: 1 });
    bvh.insert(e1);
    bvh.insert(e2);
    const near = bvh.query(e1);
    expect(near.has(e2)).toBe(true);
  });

  it('queryAABB filters correctly', () => {
    const bvh = new BVH();
    const e1 = new Entity({ position: { x: -5, y: -5 }, radius: 1 });
    const e2 = new Entity({ position: { x: 50, y: 50 }, radius: 1 });
    bvh.insert(e1);
    bvh.insert(e2);
    const res = bvh.queryAABB(new AABB(-10,-10,10,10));
    expect(res.has(e1)).toBe(true);
    expect(res.has(e2)).toBe(false);
  });
});


