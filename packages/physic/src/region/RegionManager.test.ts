import { describe, expect, it, vi } from 'vitest';
import { AABB } from '../core/math/AABB';
import { Vector2 } from '../core/math/Vector2';
import { Entity } from '../physics/Entity';
import { Region } from './Region';
import { RegionManager } from './RegionManager';
import { migrateEntities, migrateEntity } from './migration';

describe('Region', () => {
  it('manages entities, active state and bounds', () => {
    const region = new Region({
      bounds: new AABB(0, 0, 100, 100),
      overlap: 10,
      active: false,
    });
    const entity = new Entity({
      uuid: 'entity',
      position: { x: 50, y: 50 },
      radius: 2,
      mass: 1,
      velocity: { x: 10, y: 0 },
    });

    expect(region.isActive()).toBe(false);
    expect(region.contains(new Vector2(50, 50))).toBe(true);
    expect(region.shouldContain(entity)).toBe(true);
    expect(region.getExpandedBounds().minX).toBe(-10);
    expect(region.getBounds().minX).toBe(0);

    region.addEntity(entity);
    expect(region.getEntities()).toContain(entity);

    region.step();
    expect(entity.position.x).toBe(50);

    region.activate();
    region.step();
    expect(entity.position.x).toBeGreaterThan(50);

    region.deactivate();
    expect(region.isActive()).toBe(false);

    region.removeEntity(entity);
    expect(region.getEntities()).toEqual([]);
  });

  it('detects overlaps and boundary entities', () => {
    const region = new Region({
      bounds: new AABB(0, 0, 100, 100),
      overlap: 20,
    });
    const other = new Region({
      bounds: new AABB(90, 0, 190, 100),
    });
    const entity = new Entity({
      uuid: 'boundary',
      position: { x: 110, y: 50 },
      radius: 2,
      mass: 1,
    });

    region.addEntity(entity);

    expect(region.overlaps(other)).toBe(true);
    expect(region.getBoundaryEntities()).toContain(entity);
  });
});

describe('RegionManager', () => {
  it('creates regions, adds entities and migrates them after movement', () => {
    const manager = new RegionManager({
      worldBounds: new AABB(0, 0, 200, 100),
      regionSize: 100,
      autoActivate: true,
    });
    const entity = new Entity({
      uuid: 'entity',
      position: { x: 50, y: 50 },
      radius: 2,
      mass: 1,
    });

    manager.addEntity(entity);
    const firstRegion = manager.getEntityRegion(entity);

    expect(manager.getRegions()).toHaveLength(2);
    expect(firstRegion).not.toBeNull();
    expect(firstRegion?.isActive()).toBe(true);
    expect(manager.getActiveRegions()).toContain(firstRegion);
    expect(manager.getRegionAt(new Vector2(150, 50))).not.toBe(firstRegion);
    expect(manager.getRegionsInBounds(new AABB(95, 0, 105, 100))).toHaveLength(2);

    entity.position.set(150, 50);
    manager.updateEntity(entity);

    expect(manager.getEntityRegion(entity)).not.toBe(firstRegion);
    expect(firstRegion?.isActive()).toBe(false);
  });

  it('steps active regions and reports stats', () => {
    const manager = new RegionManager({
      worldBounds: new AABB(0, 0, 100, 100),
      regionSize: 100,
      autoActivate: false,
    });
    const entity = new Entity({
      uuid: 'entity',
      position: { x: 10, y: 10 },
      radius: 2,
      mass: 1,
      velocity: { x: 60, y: 0 },
    });

    manager.addEntity(entity);
    manager.step();

    expect(entity.position.x).toBeGreaterThan(10);
    expect(manager.getStats()).toEqual({
      totalRegions: 1,
      activeRegions: 1,
      totalEntities: 1,
    });
  });

  it('removes and clears entities', () => {
    const manager = new RegionManager({
      worldBounds: new AABB(0, 0, 100, 100),
      regionSize: 100,
    });
    const entity = new Entity({
      uuid: 'entity',
      position: { x: 10, y: 10 },
      radius: 2,
      mass: 1,
    });

    manager.addEntity(entity);
    manager.removeEntity(entity);
    expect(manager.getEntityRegion(entity)).toBeNull();

    manager.addEntity(entity);
    manager.clear();
    expect(manager.getStats().totalEntities).toBe(0);
  });

  it('drops entities that move outside world bounds', () => {
    const manager = new RegionManager({
      worldBounds: new AABB(0, 0, 100, 100),
      regionSize: 100,
    });
    const entity = new Entity({
      uuid: 'entity',
      position: { x: 10, y: 10 },
      radius: 2,
      mass: 1,
    });

    manager.addEntity(entity);
    entity.position.set(200, 200);
    manager.updateEntity(entity);

    expect(manager.getEntityRegion(entity)).toBeNull();
  });
});

describe('region migration helpers', () => {
  it('migrates one or many entities and calls handlers', () => {
    const from = new Region({ bounds: new AABB(0, 0, 100, 100) });
    const to = new Region({ bounds: new AABB(100, 0, 200, 100) });
    const first = new Entity({
      uuid: 'first',
      position: { x: 10, y: 10 },
      radius: 2,
      mass: 1,
    });
    const second = new Entity({
      uuid: 'second',
      position: { x: 20, y: 10 },
      radius: 2,
      mass: 1,
    });
    const handler = vi.fn();

    from.addEntity(first);
    from.addEntity(second);

    migrateEntity(first, from, to, handler);
    migrateEntities([{ entity: second, fromRegion: from, toRegion: to }], handler);

    expect(from.getEntities()).toEqual([]);
    expect(to.getEntities()).toEqual([first, second]);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
