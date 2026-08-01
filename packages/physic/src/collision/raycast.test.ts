import { describe, it, expect } from 'vitest';
import { Vector2 } from '../core/math/Vector2';
import { SpatialHash } from './spatial-hash';
import { Entity } from '../physics/Entity';
import {
  capsuleCast,
  capsuleCastCollider,
  raycast,
  raycastCollider,
} from './raycast';
import { assignPolygonCollider } from './PolygonCollider';
import { Ray } from './Ray';
import { createCollider } from './detector';
import { PhysicsEngine } from '../api/PhysicsEngine';

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

  it('handles parallel slabs, overlap, and targets behind the origin exactly', () => {
    const partition = new SpatialHash(10, 32);
    const overlap = new Entity({
      uuid: 'overlap',
      position: { x: 0, y: 0 },
      width: 8,
      height: 8,
    });
    const behind = new Entity({
      uuid: 'behind',
      position: { x: -20, y: 0 },
      width: 8,
      height: 8,
    });
    partition.insert(overlap);
    partition.insert(behind);

    const hit = raycast(
      partition as any,
      new Vector2(0, 0),
      new Vector2(1, 0),
      100,
    );

    expect(hit?.entity).toBe(overlap);
    expect(hit?.distance).toBe(0);
    expect(raycast(
      partition as any,
      new Vector2(5, 0),
      new Vector2(1, 0),
      100,
      undefined,
      (entity) => entity === behind,
    )).toBeNull();
  });

  it('sweeps projectile radius against a laterally offset AABB', () => {
    const partition = new SpatialHash(10, 32);
    const target = new Entity({
      uuid: 'target',
      position: { x: 20, y: 5 },
      width: 8,
      height: 8,
    });
    partition.insert(target);

    expect(raycast(
      partition as any,
      new Vector2(0, 0),
      new Vector2(1, 0),
      40,
    )).toBeNull();
    expect(capsuleCast(
      partition as any,
      new Vector2(0, 0),
      new Vector2(1, 0),
      40,
      1,
    )?.entity).toBe(target);
  });

  it('uses rounded capsule corners instead of an expanded-box approximation', () => {
    const partition = new SpatialHash(10, 32);
    const target = new Entity({
      uuid: 'corner-target',
      position: { x: 24, y: 24 },
      width: 8,
      height: 8,
    });
    partition.insert(target);

    expect(capsuleCast(
      partition as any,
      new Vector2(0, 15),
      new Vector2(1, 0),
      16,
      5,
    )).toBeNull();
    expect(capsuleCast(
      partition as any,
      new Vector2(0, 15),
      new Vector2(1, 0),
      21,
      5,
    )?.entity).toBe(target);
  });

  it.each([
    {
      shape: 'circle',
      create: () => new Entity({
        uuid: 'circle',
        position: { x: 20, y: 0 },
        radius: 4,
      }),
    },
    {
      shape: 'AABB',
      create: () => new Entity({
        uuid: 'aabb',
        position: { x: 20, y: 0 },
        width: 8,
        height: 8,
      }),
    },
    {
      shape: 'capsule',
      create: () => new Entity({
        uuid: 'capsule',
        position: { x: 20, y: 0 },
        capsule: { radius: 4, height: 12 },
      }),
    },
    {
      shape: 'polygon',
      create: () => {
        const entity = new Entity({
          uuid: 'polygon',
          position: { x: 20, y: 0 },
        });
        assignPolygonCollider(entity, {
          vertices: [
            new Vector2(-4, -4),
            new Vector2(4, -4),
            new Vector2(4, 4),
            new Vector2(-4, 4),
          ],
          isConvex: true,
        });
        return entity;
      },
    },
  ])('keeps direct and PhysicsEngine casts equivalent for $shape colliders', ({ create }) => {
    const target = create();
    const collider = createCollider(target);
    const engine = new PhysicsEngine({ spatialCellSize: 10 });
    engine.addEntity(target);
    expect(collider).not.toBeNull();

    const origin = new Vector2(0, 0);
    const nonUnitDirection = new Vector2(7, 0);
    const directRay = raycastCollider(
      collider!,
      origin,
      nonUnitDirection,
      40,
    );
    const worldRay = engine.raycast(origin, nonUnitDirection, 40);
    expect(worldRay?.entity).toBe(target);
    expect(worldRay?.distance).toBeCloseTo(directRay!.distance, 8);

    const directCapsule = capsuleCastCollider(
      collider!,
      origin,
      nonUnitDirection,
      40,
      2,
    );
    const worldCapsule = engine.capsuleCast(
      origin,
      nonUnitDirection,
      40,
      2,
    );
    expect(worldCapsule?.entity).toBe(target);
    expect(worldCapsule?.distance).toBeCloseTo(directCapsule!.distance, 8);

    const overlapOrigin = target.position.clone();
    expect(engine.raycast(overlapOrigin, nonUnitDirection, 1)?.distance).toBe(0);
    expect(engine.capsuleCast(
      overlapOrigin,
      nonUnitDirection,
      1,
      2,
    )?.distance).toBe(0);
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

  it('treats a repeated closing vertex as only that vertex', () => {
    const triangle = new Entity({
      uuid: 'closed-triangle',
      position: { x: 20, y: 20 },
    });
    assignPolygonCollider(triangle, {
      vertices: [
        new Vector2(0, 0),
        new Vector2(8, 0),
        new Vector2(0, 8),
        new Vector2(0, 0),
      ],
      isConvex: true,
    });
    const collider = createCollider(triangle)!;
    const engine = new PhysicsEngine({ spatialCellSize: 8 });
    engine.addEntity(triangle);
    // This diagonal's broad-phase path shares the triangle's spatial cells,
    // while the line itself stays below the triangle (y = x - 9 through its
    // x-range). The repeated vertex used to turn the remote origin into a
    // false overlap at distance zero after the engine admitted the collider.
    const outside = new Vector2(0, -9);
    const miss = new Vector2(1, 1);

    expect(raycastCollider(collider, outside, miss, 50)).toBeNull();
    expect(engine.raycast(outside, miss, 50)).toBeNull();

    const repeatedVertex = new Vector2(20, 20);
    const away = new Vector2(-1, 0);
    expect(raycastCollider(
      collider,
      repeatedVertex,
      away,
      10,
    )?.distance).toBe(0);
    expect(engine.raycast(repeatedVertex, away, 10)?.distance).toBe(0);
  });

  it.each([
    { name: 'top edge', origin: [20, -4], directions: [[1, 0], [-1, 0]] },
    { name: 'bottom edge', origin: [20, 4], directions: [[1, 0], [-1, 0]] },
    { name: 'left edge', origin: [16, 0], directions: [[0, 1], [0, -1]] },
    { name: 'right edge', origin: [24, 0], directions: [[0, 1], [0, -1]] },
    {
      name: 'top-left corner',
      origin: [16, -4],
      directions: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    },
    {
      name: 'top-right corner',
      origin: [24, -4],
      directions: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    },
    {
      name: 'bottom-left corner',
      origin: [16, 4],
      directions: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    },
    {
      name: 'bottom-right corner',
      origin: [24, 4],
      directions: [[1, 0], [-1, 0], [0, 1], [0, -1]],
    },
  ])('returns distance zero from the polygon $name in every parallel direction', ({
    origin,
    directions,
  }) => {
    const polygon = new Entity({
      uuid: 'boundary-polygon',
      position: { x: 20, y: 0 },
    });
    assignPolygonCollider(polygon, {
      vertices: [
        new Vector2(-4, -4),
        new Vector2(4, -4),
        new Vector2(4, 4),
        new Vector2(-4, 4),
      ],
      isConvex: true,
    });
    const collider = createCollider(polygon)!;
    const engine = new PhysicsEngine({ spatialCellSize: 8 });
    engine.addEntity(polygon);

    for (const [x, y] of directions) {
      const rayOrigin = new Vector2(origin[0]!, origin[1]!);
      const direction = new Vector2(x!, y!);
      expect(
        raycastCollider(collider, rayOrigin, direction, 10)?.distance,
      ).toBe(0);
      expect(engine.raycast(rayOrigin, direction, 10)?.distance).toBe(0);
    }
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
