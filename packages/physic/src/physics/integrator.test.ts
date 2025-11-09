import { describe, it, expect } from 'vitest';
import { Integrator, IntegrationMethod } from './integrator';
import { Entity } from './Entity';
import { Vector2 } from '../core/math/Vector2';

describe('Integrator', () => {
  it('should integrate entity with Euler method', () => {
    const integrator = new Integrator({
      deltaTime: 1 / 60,
      method: IntegrationMethod.Euler,
    });

    const entity = new Entity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: 1, y: 0 },
    });

    const initialX = entity.position.x;
    integrator.integrate(entity);
    expect(entity.position.x).toBeGreaterThan(initialX);
  });

  it('should apply damping', () => {
    const integrator = new Integrator({
      deltaTime: 1 / 60,
    });

    const entity = new Entity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
      velocity: { x: 10, y: 0 },
      linearDamping: 0.1,
    });

    const initialVelocity = entity.velocity.x;
    integrator.integrate(entity);
    expect(Math.abs(entity.velocity.x)).toBeLessThan(Math.abs(initialVelocity));
  });

  it('should apply gravity', () => {
    const integrator = new Integrator({
      deltaTime: 1 / 60,
      gravity: new Vector2(0, -9.81),
    });

    const entity = new Entity({
      position: { x: 0, y: 0 },
      radius: 5,
      mass: 1,
    });

    integrator.integrate(entity);
    expect(entity.velocity.y).toBeLessThan(0);
  });
});

