import { describe, it, expect } from 'vitest';
import { Entity } from './Entity';
import { Vector2 } from '../core/math/Vector2';
import { EntityState } from '../core/types';

describe('Entity', () => {
  it('should create an entity with default values', () => {
    const entity = new Entity();
    expect(entity.position.x).toBe(0);
    expect(entity.position.y).toBe(0);
    expect(entity.mass).toBe(1);
  });

  it('should create an entity with configuration', () => {
    const entity = new Entity({
      position: { x: 10, y: 20 },
      mass: 2,
      radius: 5,
    });
    expect(entity.position.x).toBe(10);
    expect(entity.position.y).toBe(20);
    expect(entity.mass).toBe(2);
    expect(entity.radius).toBe(5);
  });

  it('should apply force', () => {
    const entity = new Entity({ mass: 1 });
    entity.applyForce(new Vector2(10, 0));
    expect(entity.force.x).toBe(10);
    expect(entity.force.y).toBe(0);
  });

  it('should apply impulse', () => {
    const entity = new Entity({ mass: 1 });
    entity.applyImpulse(new Vector2(5, 0));
    expect(entity.velocity.x).toBe(5);
    expect(entity.velocity.y).toBe(0);
  });

  it('should teleport entity', () => {
    const entity = new Entity();
    entity.teleport(new Vector2(100, 200));
    expect(entity.position.x).toBe(100);
    expect(entity.position.y).toBe(200);
  });

  it('should freeze entity', () => {
    const entity = new Entity();
    entity.freeze();
    expect(entity.isStatic()).toBe(true);
    expect(entity.velocity.x).toBe(0);
    expect(entity.velocity.y).toBe(0);
  });

  it('should check collision masks', () => {
    const entity1 = new Entity({ collisionCategory: 0x01, collisionMask: 0x02 });
    const entity2 = new Entity({ collisionCategory: 0x02, collisionMask: 0x01 });
    expect(entity1.canCollideWith(entity2)).toBe(true);
  });

  it('should treat mass = 0 as static', () => {
    const entity = new Entity({ mass: 0 });
    expect(entity.mass).toBe(0);
    expect(entity.invMass).toBe(0);
    expect(entity.isStatic()).toBe(true);
  });

  it('should treat mass = Infinity as static', () => {
    const entity = new Entity({ mass: Infinity });
    expect(entity.mass).toBe(Infinity);
    expect(entity.invMass).toBe(0);
    expect(entity.isStatic()).toBe(true);
  });

  it('should not apply force to static entity with mass = Infinity', () => {
    const entity = new Entity({ mass: Infinity });
    entity.applyForce(new Vector2(100, 0));
    expect(entity.force.x).toBe(0);
    expect(entity.force.y).toBe(0);
  });

  it('should not apply impulse to static entity with mass = Infinity', () => {
    const entity = new Entity({ mass: Infinity });
    entity.applyImpulse(new Vector2(100, 0));
    expect(entity.velocity.x).toBe(0);
    expect(entity.velocity.y).toBe(0);
  });

  it('should treat dynamic entity with mass > 0 as non-static', () => {
    const entity = new Entity({ mass: 1 });
    expect(entity.mass).toBe(1);
    expect(entity.invMass).toBe(1);
    expect(entity.isStatic()).toBe(false);
    expect(entity.isDynamic()).toBe(true);
  });
});

