import { describe, it, expect } from 'vitest';
import { Quadtree } from './quadtree';
import { AABB } from '../core/math/AABB';
import { Entity } from '../physics/Entity';

describe('Quadtree', () => {
  it('inserts and queries nearby entities', () => {
    const qt = new Quadtree(new AABB(-100, -100, 100, 100), 4, 6);
    const e1 = new Entity({ position: { x: 0, y: 0 }, radius: 1 });
    const e2 = new Entity({ position: { x: 1, y: 1 }, radius: 1 });
    const e3 = new Entity({ position: { x: 50, y: 50 }, radius: 1 });
    qt.insert(e1);
    qt.insert(e2);
    qt.insert(e3);
    const near = qt.query(e1);
    expect(near.has(e2)).toBe(true);
    expect(near.has(e3)).toBe(false);
  });

  it('queryAABB returns entities inside region', () => {
    const qt = new Quadtree(new AABB(-100, -100, 100, 100), 4, 6);
    const e1 = new Entity({ position: { x: -10, y: -10 }, radius: 1 });
    const e2 = new Entity({ position: { x: 80, y: 0 }, radius: 1 });
    qt.insert(e1);
    qt.insert(e2);
    const results = qt.queryAABB(new AABB(-20, -20, 0, 0));
    expect(results.has(e1)).toBe(true);
    expect(results.has(e2)).toBe(false);
  });
});


