import { describe, expect, it, vi } from 'vitest';
import { PhysicsEngine } from '../api/PhysicsEngine';
import { ProjectileSystem } from './ProjectileSystem';

describe('ProjectileSystem', () => {
  it('advances projectiles deterministically without creating physics entities', () => {
    const engine = new PhysicsEngine();
    const projectiles = new ProjectileSystem(engine);

    projectiles.spawn({
      id: 'arrow',
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      speed: 10,
      range: 100,
      ttl: 10,
      spawnTick: 7,
    });

    projectiles.step(0.5);

    const arrow = projectiles.getProjectile('arrow');
    expect(arrow?.position.x).toBeCloseTo(5);
    expect(arrow?.position.y).toBeCloseTo(0);
    expect(arrow?.distanceTraveled).toBeCloseTo(5);
    expect(arrow?.age).toBeCloseTo(0.5);
    expect(arrow?.spawnTick).toBe(7);
    expect(engine.getEntities()).toHaveLength(0);
  });

  it('emits hit and destroy events when a projectile reaches an obstacle', () => {
    const engine = new PhysicsEngine();
    engine.createStaticObstacle('wall', {
      x: 50,
      y: 0,
      width: 10,
      height: 20,
    });
    const projectiles = new ProjectileSystem(engine);
    const onHit = vi.fn();
    const onDestroy = vi.fn();
    projectiles.onHit(onHit);
    projectiles.onDestroy(onDestroy);

    projectiles.spawn({
      id: 'arrow',
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      speed: 100,
      range: 200,
      ttl: 10,
    });
    projectiles.step(1);

    expect(projectiles.getProjectile('arrow')).toBeUndefined();
    expect(onHit).toHaveBeenCalledOnce();
    expect(onHit.mock.calls[0][0].hit.entity.uuid).toBe('wall');
    expect(onDestroy).toHaveBeenCalledWith(expect.objectContaining({ reason: 'hit' }));
  });

  it('destroys projectiles when ttl expires', () => {
    const projectiles = new ProjectileSystem(new PhysicsEngine());
    const onDestroy = vi.fn();
    projectiles.onDestroy(onDestroy);

    projectiles.spawn({
      id: 'spark',
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      speed: 10,
      range: 100,
      ttl: 0.25,
    });
    projectiles.step(0.5);

    expect(projectiles.getProjectile('spark')).toBeUndefined();
    expect(onDestroy).toHaveBeenCalledWith(expect.objectContaining({ reason: 'ttl' }));
  });

  it('destroys projectiles when range is reached', () => {
    const projectiles = new ProjectileSystem(new PhysicsEngine());
    const onDestroy = vi.fn();
    projectiles.onDestroy(onDestroy);

    projectiles.spawn({
      id: 'bolt',
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      speed: 100,
      range: 10,
      ttl: 10,
    });
    projectiles.step(1);

    expect(projectiles.getProjectile('bolt')).toBeUndefined();
    expect(onDestroy).toHaveBeenCalledWith(expect.objectContaining({ reason: 'range' }));
  });

  it('ignores the owner by default', () => {
    const engine = new PhysicsEngine();
    engine.createEntity({
      uuid: 'owner',
      position: { x: 5, y: 0 },
      radius: 10,
      mass: 1,
    });
    const projectiles = new ProjectileSystem(engine);
    const onHit = vi.fn();
    projectiles.onHit(onHit);

    projectiles.spawn({
      id: 'arrow',
      ownerId: 'owner',
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      speed: 10,
      range: 100,
      ttl: 10,
    });
    projectiles.step(0.5);

    expect(onHit).not.toHaveBeenCalled();
    expect(projectiles.getProjectile('arrow')).toBeDefined();
  });

  it('can track many active projectiles without adding physics entities', () => {
    const engine = new PhysicsEngine();
    const projectiles = new ProjectileSystem(engine);

    for (let i = 0; i < 1000; i += 1) {
      projectiles.spawn({
        id: `projectile-${i}`,
        origin: { x: 0, y: i },
        direction: { x: 1, y: 0 },
        speed: 100,
        range: 1000,
        ttl: 10,
      });
    }

    projectiles.step(1 / 60);

    expect(projectiles.getProjectiles()).toHaveLength(1000);
    expect(engine.getEntities()).toHaveLength(0);
  });
});
