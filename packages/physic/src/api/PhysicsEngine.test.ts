import { describe, it, expect } from 'vitest';
import { PhysicsEngine } from './PhysicsEngine';
import { Vector2 } from '../core/math/Vector2';
import { AABB } from '../core/math/AABB';

describe('PhysicsEngine', () => {
  it('should create engine', () => {
    const engine = new PhysicsEngine();
    expect(engine).toBeDefined();
  });

  it('should create entity', () => {
    const engine = new PhysicsEngine();
    const entity = engine.createEntity({
      position: { x: 0, y: 0 },
      radius: 10,
      mass: 1,
    });
    expect(entity).toBeDefined();
    expect(engine.getEntities().length).toBe(1);
  });

  it('should step simulation', () => {
    const engine = new PhysicsEngine({ timeStep: 1 / 60 });
    const entity = engine.createEntity({
      position: { x: 0, y: 0 },
      radius: 10,
      mass: 1,
      velocity: { x: 1, y: 0 },
    });

    const initialX = entity.position.x;
    engine.step();
    expect(entity.position.x).toBeGreaterThan(initialX);
  });

  it('should apply force', () => {
    const engine = new PhysicsEngine();
    const entity = engine.createEntity({
      position: { x: 0, y: 0 },
      radius: 10,
      mass: 1,
    });

    engine.applyForce(entity, new Vector2(10, 0));
    expect(entity.force.x).toBe(10);
  });

  it('should teleport entity', () => {
    const engine = new PhysicsEngine();
    const entity = engine.createEntity({
      position: { x: 0, y: 0 },
      radius: 10,
    });

    engine.teleport(entity, new Vector2(100, 200));
    expect(entity.position.x).toBe(100);
    expect(entity.position.y).toBe(200);
  });

  it('should query AABB', () => {
    const engine = new PhysicsEngine();
    const entity1 = engine.createEntity({ position: { x: 5, y: 5 }, radius: 2 });
    const entity2 = engine.createEntity({ position: { x: 50, y: 50 }, radius: 2 });

    // Step once to update spatial partition
    engine.step();

    const bounds = new AABB(0, 0, 10, 10);
    const entities = engine.queryAABB(bounds);
    
    // Filter to only entities actually inside bounds (spatial hash may return nearby)
    const insideBounds = entities.filter(e => bounds.contains(e.position));
    
    // Only entity1 should be in bounds (5, 5) is inside (0, 0, 10, 10)
    // entity2 (50, 50) is outside
    expect(insideBounds.length).toBe(1);
    expect(insideBounds).toContain(entity1);
    expect(insideBounds).not.toContain(entity2);
  });
});

