import { describe, it, expect } from 'vitest';
import { Vector2 } from '../core/math/Vector2';
import { SpatialHash } from './spatial-hash';
import { Entity } from '../physics/Entity';
import { raycast } from './raycast';
import { assignPolygonCollider } from './PolygonCollider';
import { Ray } from './Ray';

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

  it('uses default direction when a zero vector is provided', () => {
    const partition = new SpatialHash(10, 32);
    const circle = new Entity({ position: { x: 20, y: 0 }, radius: 5 });
    partition.insert(circle);

    const hit = raycast(partition as any, new Vector2(0, 0), new Vector2(0, 0), 100);

    expect(hit).not.toBeNull();
    expect(hit!.entity).toBe(circle);
  });

  it('respects masks and filters', () => {
    const partition = new SpatialHash(10, 32);
    const ignored = new Entity({
      uuid: 'ignored',
      position: { x: 20, y: 0 },
      radius: 5,
      collisionCategory: 0x01,
    });
    const target = new Entity({
      uuid: 'target',
      position: { x: 40, y: 0 },
      radius: 5,
      collisionCategory: 0x02,
    });
    partition.insert(ignored);
    partition.insert(target);

    const hit = raycast(
      partition as any,
      new Vector2(0, 0),
      new Vector2(1, 0),
      100,
      0x02,
      (entity) => entity.uuid !== 'ignored',
    );

    expect(hit).not.toBeNull();
    expect(hit!.entity).toBe(target);
  });

  it('falls back to queryAABB when partition raycast returns no hit', () => {
    const circle = new Entity({ position: { x: 20, y: 0 }, radius: 5 });
    const partition = {
      raycast: () => null,
      queryAABB: () => [circle],
    };

    const hit = raycast(partition as any, new Vector2(0, 0), new Vector2(1, 0), 100);

    expect(hit).not.toBeNull();
    expect(hit!.entity).toBe(circle);
  });

  it('returns null when fallback candidates are missed', () => {
    const circle = new Entity({ position: { x: 20, y: 20 }, radius: 5 });
    const partition = {
      raycast: () => null,
      queryAABB: () => [circle],
    };

    const hit = raycast(partition as any, new Vector2(0, 0), new Vector2(1, 0), 10);

    expect(hit).toBeNull();
  });

  it('normalizes Ray direction and gets points along it', () => {
    const ray = new Ray(new Vector2(1, 2), new Vector2(10, 0), 100);

    expect(ray.direction.x).toBeCloseTo(1);
    expect(ray.direction.y).toBeCloseTo(0);
    expect(ray.getPoint(5).x).toBeCloseTo(6);
    expect(ray.getPoint(5).y).toBeCloseTo(2);
  });
});

