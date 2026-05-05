import { describe, expect, it } from 'vitest';
import { Entity } from '../physics/Entity';
import { Vector2 } from '../core/math/Vector2';
import { assignPolygonCollider } from './PolygonCollider';
import { testCollision } from './detector';

describe('collision detector', () => {
  it('detects circle and polygon collisions in both entity orders', () => {
    const circle = new Entity({ uuid: 'circle', position: { x: 0.5, y: 0 }, radius: 0.6 });
    const polygon = new Entity({ uuid: 'polygon', position: { x: 0, y: 0 } });
    assignPolygonCollider(polygon, {
      vertices: [
        new Vector2(-1, -1),
        new Vector2(1, -1),
        new Vector2(1, 1),
        new Vector2(-1, 1),
      ],
      isConvex: true,
    });

    expectSymmetricCollision(circle, polygon);
  });

  it('detects AABB and polygon collisions in both entity orders', () => {
    const box = new Entity({ uuid: 'box', position: { x: 1, y: 0 }, width: 2, height: 2 });
    const polygon = new Entity({ uuid: 'polygon', position: { x: 0, y: 0 } });
    assignPolygonCollider(polygon, {
      vertices: [
        new Vector2(-2, -0.5),
        new Vector2(0.5, -0.5),
        new Vector2(0.5, 0.5),
        new Vector2(-2, 0.5),
      ],
      isConvex: true,
    });

    expectSymmetricCollision(box, polygon);
  });

  it('detects circle and capsule collisions in both entity orders', () => {
    const circle = new Entity({ uuid: 'circle', position: { x: 8, y: 0 }, radius: 4 });
    const capsule = new Entity({
      uuid: 'capsule',
      position: { x: 0, y: 0 },
      capsule: { radius: 5, height: 20 },
    });

    expectSymmetricCollision(circle, capsule);
  });

  it('detects AABB and capsule collisions in both entity orders', () => {
    const box = new Entity({ uuid: 'box', position: { x: 8, y: 0 }, width: 10, height: 10 });
    const capsule = new Entity({
      uuid: 'capsule',
      position: { x: 0, y: 0 },
      capsule: { radius: 5, height: 20 },
    });

    expectSymmetricCollision(box, capsule);
  });
});

function expectSymmetricCollision(entityA: Entity, entityB: Entity): void {
  const forward = testCollision(entityA, entityB);
  const reverse = testCollision(entityB, entityA);

  expect(forward).not.toBeNull();
  expect(reverse).not.toBeNull();

  expect(forward!.entityA).toBe(entityA);
  expect(forward!.entityB).toBe(entityB);
  expect(reverse!.entityA).toBe(entityB);
  expect(reverse!.entityB).toBe(entityA);

  expect(forward!.depth).toBeCloseTo(reverse!.depth);
  expect(forward!.normal.x).toBeCloseTo(-reverse!.normal.x);
  expect(forward!.normal.y).toBeCloseTo(-reverse!.normal.y);
}
