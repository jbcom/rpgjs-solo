import { describe, it, expect, beforeEach } from 'vitest';
import { World } from './World';
import { Entity } from '../physics/Entity';
import { Vector2 } from '../core/math/Vector2';

describe('World', () => {
  let world: World;

  beforeEach(() => {
    world = new World({ timeStep: 1 / 60 });
  });

  it('should create a world', () => {
    expect(world).toBeDefined();
    expect(world.getEntities().length).toBe(0);
  });

  it('should add entity', () => {
    const entity = new Entity({ position: { x: 0, y: 0 }, radius: 10 });
    world.addEntity(entity);
    expect(world.getEntities().length).toBe(1);
  });

  it('should remove entity', () => {
    const entity = new Entity({ position: { x: 0, y: 0 }, radius: 10 });
    world.addEntity(entity);
    world.removeEntity(entity);
    expect(world.getEntities().length).toBe(0);
  });

  it('should step simulation', () => {
    const entity = world.createEntity({
      position: { x: 0, y: 0 },
      radius: 10,
      mass: 1,
      velocity: { x: 1, y: 0 },
    });

    const initialX = entity.position.x;
    world.step();
    expect(entity.position.x).toBeGreaterThan(initialX);
  });

  it('should detect collisions', () => {
    const entity1 = world.createEntity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
    });
    const entity2 = world.createEntity({
      position: { x: 8, y: 0 },
      radius: 5,
      mass: 1,
    });

    let collisionDetected = false;
    world.getEvents().onCollisionEnter(() => {
      collisionDetected = true;
    });

    world.step();
    expect(collisionDetected).toBe(true);
  });

  it('should get entity by UUID', () => {
    const entity = world.createEntity({
      position: { x: 0, y: 0 },
      radius: 10,
    });
    const found = world.getEntityByUUID(entity.uuid);
    expect(found).toBe(entity);
  });

  it('should clear all entities', () => {
    world.createEntity({ position: { x: 0, y: 0 }, radius: 10 });
    world.createEntity({ position: { x: 10, y: 10 }, radius: 10 });
    world.clear();
    expect(world.getEntities().length).toBe(0);
  });
});

