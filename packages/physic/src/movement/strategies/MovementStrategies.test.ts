import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhysicsEngine } from '../../api/PhysicsEngine';
import { Entity } from '../../physics/Entity';
import { EntityMovementBody } from '../adapters/EntityMovementBody';
import { LinearMove } from './LinearMove';
import { Dash } from './Dash';
import { SeekAvoid } from './SeekAvoid';

/**
 * Helper to create a movement body from an entity.
 */
function createBody(entity: Entity): EntityMovementBody {
  return new EntityMovementBody(entity);
}

describe('Movement strategies', () => {
  let engine: PhysicsEngine;

  beforeEach(() => {
    engine = new PhysicsEngine({ timeStep: 1 / 60 });
  });

  describe('LinearMove', () => {
    it('applies constant velocity', () => {
      const entity = engine.createEntity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const body = createBody(entity);
      const strategy = new LinearMove({ x: 120, y: -60 });

      strategy.update(body, 0.016);

      expect(entity.velocity.x).toBeCloseTo(120);
      expect(entity.velocity.y).toBeCloseTo(-60);
      expect(strategy.isFinished?.()).toBe(false);
    });
  });

  describe('Dash', () => {
    it('accelerates then stops after duration', () => {
      const entity = engine.createEntity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const body = createBody(entity);
      const strategy = new Dash(200, { x: 1, y: 0 }, 0.1);

      strategy.update(body, 0.05);
      expect(entity.velocity.x).toBeCloseTo(200);
      expect(strategy.isFinished()).toBe(false);

      strategy.update(body, 0.1);
      expect(entity.velocity.x).toBeCloseTo(0);
      expect(entity.velocity.y).toBeCloseTo(0);
      expect(strategy.isFinished()).toBe(true);
    });
  });

  describe('SeekAvoid', () => {
    it('moves towards the target entity', () => {
      const follower = engine.createEntity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const target = engine.createEntity({
        position: { x: 100, y: 0 },
        mass: 1,
      });

      const body = createBody(follower);
      const strategy = new SeekAvoid(engine, () => target, 4, 6, 4);

      strategy.update(body, 1 / 60);

      expect(follower.velocity.x).toBeGreaterThan(0);
      expect(Math.abs(follower.velocity.y)).toBeLessThan(0.0001);
    });

    it('avoids nearby entities while seeking', () => {
      const follower = new Entity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const target = new Entity({
        position: { x: 10, y: 0 },
        mass: 1,
      });
      const obstacle = new Entity({
        position: { x: 4, y: 1 },
        mass: 1,
      });

      const query = vi.fn<Entity[], [unknown]>()
        .mockReturnValueOnce([follower, target])
        .mockReturnValueOnce([follower, target, obstacle]);

      const fakeEngine = { queryAABB: query } as unknown as PhysicsEngine;
      const strategy = new SeekAvoid(fakeEngine, () => target, 3, 6, 12);
      const body = createBody(follower);

      strategy.update(body, 1 / 60);
      const baselineVelocity = follower.velocity.clone();

      follower.setVelocity({ x: 0, y: 0 });
      strategy.update(body, 1 / 60);

      expect(query).toHaveBeenCalledTimes(2);
      expect(follower.velocity.length()).toBeLessThanOrEqual(baselineVelocity.length());
      expect(Math.abs(follower.velocity.y)).toBeGreaterThan(0);
    });
  });
});

