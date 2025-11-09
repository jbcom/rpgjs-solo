import { describe, it, expect } from 'vitest';
import { CircleCollider } from './CircleCollider';
import { AABBCollider } from './AABBCollider';
import { Entity } from '../physics/Entity';
import { Vector2 } from '../core/math/Vector2';

describe('CircleCollider', () => {
  it('should create a circle collider', () => {
    const entity = new Entity({ position: { x: 0, y: 0 }, radius: 10 });
    const collider = new CircleCollider(entity);
    expect(collider.getRadius()).toBe(10);
  });

  it('should detect collision between circles', () => {
    const entity1 = new Entity({ position: { x: 0, y: 0 }, radius: 5 });
    const entity2 = new Entity({ position: { x: 8, y: 0 }, radius: 5 });
    const collider1 = new CircleCollider(entity1);
    const collider2 = new CircleCollider(entity2);

    const collision = collider1.testCollision(collider2);
    expect(collision).not.toBeNull();
    expect(collision!.depth).toBeGreaterThan(0);
  });

  it('should not detect collision when circles are apart', () => {
    const entity1 = new Entity({ position: { x: 0, y: 0 }, radius: 5 });
    const entity2 = new Entity({ position: { x: 20, y: 0 }, radius: 5 });
    const collider1 = new CircleCollider(entity1);
    const collider2 = new CircleCollider(entity2);

    const collision = collider1.testCollision(collider2);
    expect(collision).toBeNull();
  });

  it('should get bounds', () => {
    const entity = new Entity({ position: { x: 10, y: 20 }, radius: 5 });
    const collider = new CircleCollider(entity);
    const bounds = collider.getBounds();
    expect(bounds.minX).toBe(5);
    expect(bounds.minY).toBe(15);
    expect(bounds.maxX).toBe(15);
    expect(bounds.maxY).toBe(25);
  });

  it('should produce a normal pointing from circle to AABB when colliding', () => {
    const circle = new Entity({ position: { x: 8, y: 0 }, radius: 3, mass: 1 });
    const box = new Entity({ position: { x: 12, y: 0 }, width: 6, height: 6, mass: Infinity });
    const collision = new CircleCollider(circle).testCollision(new AABBCollider(box));

    expect(collision).not.toBeNull();
    expect(collision!.normal.x).toBeGreaterThan(0);
    expect(collision!.normal.y).toBe(0);
  });
});

