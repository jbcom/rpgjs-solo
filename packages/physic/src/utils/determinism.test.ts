import { describe, it, expect } from 'vitest';
import { PhysicsEngine } from '../api/PhysicsEngine';
import { Entity } from '../physics/Entity';

/**
 * Tests for determinism - same inputs should produce same outputs
 */
describe('Determinism', () => {
  it('should produce same results with same inputs', () => {
    // Create two identical engines
    const engine1 = new PhysicsEngine({ timeStep: 1 / 60 });
    const engine2 = new PhysicsEngine({ timeStep: 1 / 60 });

    // Create identical entities
    const entity1 = engine1.createEntity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: 10, y: 0 },
    });

    const entity2 = engine2.createEntity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: 10, y: 0 },
    });

    // Run same number of steps
    for (let i = 0; i < 100; i++) {
      engine1.step();
      engine2.step();
    }

    // Results should be identical
    expect(entity1.position.x).toBeCloseTo(entity2.position.x, 5);
    expect(entity1.position.y).toBeCloseTo(entity2.position.y, 5);
    expect(entity1.velocity.x).toBeCloseTo(entity2.velocity.x, 5);
    expect(entity1.velocity.y).toBeCloseTo(entity2.velocity.y, 5);
  });

  it('should produce same collision results', () => {
    const engine1 = new PhysicsEngine({ timeStep: 1 / 60 });
    const engine2 = new PhysicsEngine({ timeStep: 1 / 60 });

    const entity1a = engine1.createEntity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: 10, y: 0 },
    });
    const entity1b = engine1.createEntity({
      position: { x: 15, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: -10, y: 0 },
    });

    const entity2a = engine2.createEntity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: 10, y: 0 },
    });
    const entity2b = engine2.createEntity({
      position: { x: 15, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: -10, y: 0 },
    });

    // Run simulation
    for (let i = 0; i < 60; i++) {
      engine1.step();
      engine2.step();
    }

    // Results should match
    expect(entity1a.position.x).toBeCloseTo(entity2a.position.x, 5);
    expect(entity1b.position.x).toBeCloseTo(entity2b.position.x, 5);
  });
});

