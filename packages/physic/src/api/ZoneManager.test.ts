import { describe, expect, it, vi } from 'vitest';
import { PhysicsEngine } from './PhysicsEngine';

describe('ZoneManager', () => {
  it('tracks enter and exit events for static zones', () => {
    const engine = new PhysicsEngine({ timeStep: 1 });
    const entity = engine.createCharacter('npc', {
      x: 20,
      y: 0,
      hitbox: 2,
      speed: 20,
    });
    const zones = engine.getZoneManager();
    const onEnter = vi.fn();
    const onExit = vi.fn();

    zones.createZone({
      id: 'zone',
      position: { x: 0, y: 0 },
      radius: 8,
    }, { onEnter, onExit });

    zones.update();
    expect(onEnter).not.toHaveBeenCalled();

    engine.teleport(entity, { x: 2, y: 0 });
    zones.update();
    expect(onEnter).toHaveBeenCalledOnce();
    expect(zones.getEntitiesInZone('zone').map((item) => item.uuid)).toEqual(['npc']);

    engine.teleport(entity, { x: 40, y: 0 });
    zones.update();
    expect(onExit).toHaveBeenCalledOnce();
    expect(zones.getEntitiesInZone('zone')).toEqual([]);
  });

  it('updates attached zones and exposes immutable zone info', () => {
    const engine = new PhysicsEngine();
    const hero = engine.createCharacter('hero', {
      x: 0,
      y: 0,
      hitbox: 2,
      speed: 10,
    });
    const npc = engine.createCharacter('npc', {
      x: 12,
      y: 0,
      hitbox: 2,
      speed: 10,
    });
    const zones = engine.getZoneManager();

    const id = zones.createAttachedZone(hero, {
      id: 'vision',
      radius: 6,
      offset: { x: 10, y: 0 },
      metadata: { kind: 'vision' },
    });

    zones.update();
    const info = zones.getZone(id);
    expect(info?.position.x).toBe(10);
    expect(info?.metadata).toEqual({ kind: 'vision' });
    expect(zones.getAllZoneIds()).toEqual(['vision']);
    expect(zones.getEntitiesInZone(id)).toContain(npc);

    info?.position.set(999, 999);
    expect(zones.getZone(id)?.position.x).toBe(10);
  });

  it('supports cone zones and wall-limited line of sight', () => {
    const engine = new PhysicsEngine({
      spatialCellSize: 10,
      spatialGridWidth: 100,
      spatialGridHeight: 100,
    });
    const hero = engine.createCharacter('hero', {
      x: 0,
      y: 0,
      hitbox: 2,
      speed: 10,
    });
    const visible = engine.createCharacter('visible', {
      x: 20,
      y: 0,
      hitbox: 2,
      speed: 10,
    });
    const behind = engine.createCharacter('behind', {
      x: -20,
      y: 0,
      hitbox: 2,
      speed: 10,
    });
    const blocked = engine.createCharacter('blocked', {
      x: 0,
      y: 20,
      hitbox: 2,
      speed: 10,
    });
    engine.createStaticObstacle('wall', {
      x: 0,
      y: 10,
      width: 20,
      height: 2,
    });
    const zones = engine.getZoneManager();

    zones.createZone({
      id: 'cone',
      entity: hero,
      radius: 30,
      angle: 90,
      direction: 'right',
    });
    zones.createZone({
      id: 'los',
      entity: hero,
      radius: 30,
      limitedByWalls: true,
    });

    zones.update();

    expect(zones.getEntitiesInZone('cone')).toContain(visible);
    expect(zones.getEntitiesInZone('cone')).not.toContain(behind);
    expect(zones.getEntitiesInZone('los')).not.toContain(blocked);
  });

  it('updates callbacks and removes zones', () => {
    const engine = new PhysicsEngine();
    engine.createCharacter('npc', {
      x: 0,
      y: 0,
      hitbox: 2,
      speed: 10,
    });
    const zones = engine.getZoneManager();
    const onEnter = vi.fn();

    zones.createZone({
      id: 'zone',
      position: { x: 0, y: 0 },
      radius: 5,
      angle: 90,
      direction: 'left',
      limitedByWalls: false,
    });
    expect(zones.updateZone('zone', {
      radius: 10,
      angle: 360,
      direction: 'right',
      limitedByWalls: true,
      metadata: { updated: true },
    })).toBe(true);
    expect(zones.registerCallbacks('zone', { onEnter })).toBe(true);

    zones.update();
    expect(onEnter).toHaveBeenCalledOnce();
    expect(zones.getZone('zone')?.metadata).toEqual({ updated: true });

    expect(zones.removeZone('zone')).toBe(true);
    expect(zones.getZone('zone')).toBeUndefined();
    expect(zones.getEntitiesInZone('zone')).toEqual([]);
  });

  it('validates zone configuration', () => {
    const engine = new PhysicsEngine();
    const zones = engine.getZoneManager();

    expect(() => zones.createZone({
      id: 'bad',
      position: { x: 0, y: 0 },
      radius: 0,
    })).toThrow('Zone radius must be a positive number');

    zones.createZone({
      id: 'zone',
      position: { x: 0, y: 0 },
      radius: 5,
    });

    expect(() => zones.createZone({
      id: 'zone',
      position: { x: 0, y: 0 },
      radius: 5,
    })).toThrow('already exists');
    expect(() => zones.updateZone('zone', { radius: -1 })).toThrow('Zone radius must be a positive number');
    expect(zones.updateZone('missing', { radius: 10 })).toBe(false);
    expect(zones.registerCallbacks('missing', {})).toBe(false);
  });
});
