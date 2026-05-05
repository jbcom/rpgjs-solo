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

  it('should reindex a static entity after teleport', () => {
    const engine = new PhysicsEngine({
      spatialCellSize: 10,
      spatialGridWidth: 100,
      spatialGridHeight: 100,
    });
    const wall = engine.createEntity({
      position: { x: 100, y: 0 },
      radius: 2,
      mass: 0,
    });

    engine.teleport(wall, new Vector2(0, 0));

    const entities = engine.queryAABB(new AABB(-5, -5, 5, 5));
    expect(entities).toContain(wall);
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

  it('should reindex entities after restoring a snapshot', () => {
    const engine = new PhysicsEngine({
      spatialCellSize: 10,
      spatialGridWidth: 100,
      spatialGridHeight: 100,
    });
    const entity = engine.createEntity({
      uuid: 'player',
      position: { x: 100, y: 0 },
      radius: 2,
      mass: 1,
    });

    engine.restoreSnapshot({
      tick: 5,
      entities: [
        {
          uuid: entity.uuid,
          position: { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          rotation: 0,
          angularVelocity: 0,
          sleeping: false,
        },
      ],
    });

    const entities = engine.queryAABB(new AABB(-5, -5, 5, 5));
    expect(entities).toContain(entity);
    expect(engine.getTick()).toBe(5);
  });
});
