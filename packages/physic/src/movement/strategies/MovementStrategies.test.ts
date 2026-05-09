import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhysicsEngine } from '../../api/PhysicsEngine';
import { Entity } from '../../physics/Entity';
import { EntityMovementBody } from '../adapters/EntityMovementBody';
import { LinearMove } from './LinearMove';
import { Dash } from './Dash';
import { SeekAvoid } from './SeekAvoid';
import { ProjectileMovement, ProjectileType } from './ProjectileMovement';
import { IceMovement } from './IceMovement';
import { Knockback } from './Knockback';
import { LinearRepulsion } from './LinearRepulsion';
import { Oscillate } from './Oscillate';
import { PathFollow } from './PathFollow';
import { CompositeMovement } from './CompositeMovement';

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

  describe('Knockback', () => {
    it('pushes an entity and finishes after duration', () => {
      const entity = engine.createEntity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const body = createBody(entity);
      const strategy = new Knockback({ x: -1, y: 0 }, 180, 0.2, 0.5);

      strategy.update(body, 0.1);

      expect(entity.velocity.x).toBeLessThan(0);
      expect(entity.velocity.y).toBeCloseTo(0);
      expect(strategy.isFinished()).toBe(false);

      strategy.update(body, 0.2);

      expect(strategy.isFinished()).toBe(true);
      expect(entity.velocity.x).toBe(0);
    });
  });

  describe('IceMovement', () => {
    it('accelerates toward the desired direction and can stop', () => {
      const entity = engine.createEntity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const body = createBody(entity);
      const strategy = new IceMovement({ x: 1, y: 0 }, 100, 0.5, 0.5);

      strategy.update(body, 1);
      expect(entity.velocity.x).toBeGreaterThan(0);
      expect(strategy.isFinished()).toBe(false);

      strategy.stop();
      for (let i = 0; i < 12; i += 1) {
        strategy.update(body, 1);
      }

      expect(strategy.isFinished()).toBe(true);
    });

    it('can update direction and parameters', () => {
      const entity = engine.createEntity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const body = createBody(entity);
      const strategy = new IceMovement({ x: 1, y: 0 });

      strategy.setParameters(120, 1, 0.2);
      strategy.setTargetDirection({ x: 0, y: 1 });
      strategy.update(body, 1);

      expect(entity.velocity.y).toBeGreaterThan(0);
      expect(Math.abs(entity.velocity.x)).toBeLessThan(0.0001);
    });

    it('can start with existing velocity', () => {
      const entity = engine.createEntity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const body = createBody(entity);
      const strategy = new IceMovement(
        { x: 1, y: 0 },
        100,
        0,
        0.5,
        undefined,
        { x: 45, y: 0 },
      );

      strategy.update(body, 1 / 60);

      expect(entity.velocity.x).toBe(45);
      expect(entity.velocity.y).toBe(0);
    });
  });

  describe('PathFollow', () => {
    it('moves through waypoints and loops when requested', () => {
      const entity = engine.createEntity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const body = createBody(entity);
      const strategy = new PathFollow([
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ], 5, true, 0, 0.5);

      strategy.update(body, 1 / 60);
      expect(entity.velocity.x).toBeGreaterThan(0);
      expect(strategy.getCurrentWaypoint()).toBe(0);

      entity.position.set(10, 0);
      strategy.update(body, 1 / 60);
      expect(strategy.getCurrentWaypoint()).toBe(1);

      strategy.setWaypoints([{ x: 0, y: 0 }]);
      expect(strategy.getCurrentWaypoint()).toBe(0);
    });

    it('pauses at waypoints and finishes non-looping paths', () => {
      const entity = engine.createEntity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const body = createBody(entity);
      const strategy = new PathFollow([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5, false, 0.25, 0.5);

      strategy.update(body, 0.1);
      expect(entity.velocity.x).toBe(0);
      expect(strategy.isFinished()).toBe(false);

      strategy.update(body, 0.3);
      entity.position.set(10, 0);
      strategy.update(body, 0.1);

      expect(strategy.isFinished()).toBe(true);
    });
  });

  describe('Oscillate', () => {
    it('applies sine and circular oscillation velocities', () => {
      const entity = engine.createEntity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const body = createBody(entity);
      const sine = new Oscillate({ x: 1, y: 0 }, 10, 2, 'sine', 1);

      sine.update(body, 0.1);
      expect(entity.velocity.x).not.toBe(0);
      expect(sine.isFinished()).toBe(false);

      const circular = new Oscillate({ x: 1, y: 0 }, 10, 2, 'circular');
      circular.update(body, 0.25);
      expect(Math.abs(entity.velocity.y)).toBeGreaterThan(0);

      sine.reset();
      sine.update(body, 1);
      expect(sine.isFinished()).toBe(true);
    });

    it('supports linear oscillation', () => {
      const entity = engine.createEntity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const body = createBody(entity);
      const strategy = new Oscillate({ x: 0, y: 1 }, 8, 2, 'linear');

      strategy.update(body, 0.1);

      expect(entity.velocity.y).not.toBe(0);
    });
  });

  describe('CompositeMovement', () => {
    it('runs movements in sequence and parallel modes', () => {
      const entity = engine.createEntity({
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const body = createBody(entity);
      const sequence = new CompositeMovement('sequence', [
        new LinearMove({ x: 20, y: 0 }, 0.1),
        new LinearMove({ x: 0, y: 20 }, 0.1),
      ]);

      sequence.update(body, 0.2);
      expect(sequence.isFinished()).toBe(false);
      sequence.update(body, 0.2);
      expect(sequence.isFinished()).toBe(true);

      const parallel = new CompositeMovement('parallel', [
        new LinearMove({ x: 10, y: 0 }, 0.1),
        new LinearMove({ x: 0, y: 10 }, 0.1),
      ]);
      parallel.update(body, 0.2);
      expect(parallel.isFinished()).toBe(true);
      parallel.add(new LinearMove({ x: 1, y: 0 }));
      expect(parallel.remove(parallel['strategies'][0]!)).toBe(true);
      parallel.reset();
    });
  });

  describe('LinearRepulsion', () => {
    it('seeks a position while repelling from nearby dynamic entities', () => {
      const follower = engine.createEntity({
        position: { x: 0, y: 0 },
        radius: 1,
        mass: 1,
      });
      engine.createEntity({
        position: { x: 2, y: 1 },
        radius: 1,
        mass: 1,
      });
      const body = createBody(follower);
      const strategy = new LinearRepulsion(engine, () => ({ x: 10, y: 0 }), 5, 6, 4);

      strategy.update(body, 1 / 60);

      expect(follower.velocity.x).toBeGreaterThan(0);
      expect(Math.abs(follower.velocity.y)).toBeGreaterThan(0);

      strategy.setParameters(3, 4, 2);
      strategy.update(body, 1 / 60);
      expect(follower.velocity.length()).toBeLessThanOrEqual(3);
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

  describe('ProjectileMovement', () => {
    it('reports arc height updates through a server-compatible callback', () => {
      const entity = engine.createEntity({
        uuid: 'projectile',
        position: { x: 0, y: 0 },
        mass: 1,
      });
      const body = createBody(entity);
      const onHeightUpdate = vi.fn();
      const strategy = new ProjectileMovement(ProjectileType.Arc, {
        speed: 10,
        direction: { x: 1, y: 0 },
        maxHeight: 4,
        gravity: 10,
        onHeightUpdate,
      });

      strategy.update(body, 0.1);

      expect(onHeightUpdate).toHaveBeenCalledOnce();
      expect(onHeightUpdate.mock.calls[0][0]).toBeGreaterThan(0);
      expect(onHeightUpdate.mock.calls[0][1].id).toBe('projectile');
    });
  });
});
