import { describe, it, expect } from 'vitest';
import { Vector2 } from '../core/math/Vector2';
import { SpatialHash } from './spatial-hash';
import { Entity } from '../physics/Entity';
import { raycast } from './raycast';
import { assignPolygonCollider } from './PolygonCollider';

describe('raycast', () => {
  it('hits nearest circle', () => {
    const partition = new SpatialHash(10, 32);
    const e1 = new Entity({ position: { x: 20, y: 0 }, radius: 5 });
    const e2 = new Entity({ position: { x: 40, y: 0 }, radius: 5 });
    partition.insert(e1);
    partition.insert(e2);
    const hit = raycast(partition as any, new Vector2(0,0), new Vector2(1,0), 100);
    expect(hit).not.toBeNull();
    expect(hit!.entity).toBe(e1);
  });

  it('hits AABB', () => {
    const partition = new SpatialHash(10, 32);
    const box = new Entity({ position: { x: 30, y: 0 }, width: 10, height: 10 });
    partition.insert(box);
    const hit = raycast(partition as any, new Vector2(0,0), new Vector2(1,0), 100);
    expect(hit).not.toBeNull();
    expect(hit!.entity).toBe(box);
  });

  it('hits polygon', () => {
    const partition = new SpatialHash(10, 32);
    const polyE = new Entity({ position: { x: 50, y: 0 } });
    assignPolygonCollider(polyE, { vertices: [
      new Vector2(-5,-5), new Vector2(5,-5), new Vector2(5,5), new Vector2(-5,5)
    ], isConvex: true });
    partition.insert(polyE);
    const hit = raycast(partition as any, new Vector2(0,0), new Vector2(1,0), 100);
    expect(hit).not.toBeNull();
    expect(hit!.entity).toBe(polyE);
  });
});


