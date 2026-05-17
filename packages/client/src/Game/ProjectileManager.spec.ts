import { afterEach, describe, expect, test, vi } from "vitest";
import { Hooks } from "@rpgjs/common";
import { ProjectileManager } from "./ProjectileManager";

describe("ProjectileManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("renders registered projectile components from compact spawn data", () => {
    const onSpawn = vi.fn();
    const hooks = new Hooks([{ projectiles: { onSpawn } }], "client");
    const manager = new ProjectileManager(hooks);
    const component = () => null;

    manager.register("fireball", component);
    manager.spawnBatch([
      {
        id: "p1",
        type: "fireball",
        origin: { x: 10, y: 20 },
        direction: { x: 1, y: 0 },
        speed: 100,
        range: 500,
        ttl: 5,
        spawnTick: 1,
      },
    ]);

    const current = manager.current();
    expect(current).toHaveLength(1);
    expect(current[0].component).toBe(component);
    expect(current[0].props.x).toBeGreaterThanOrEqual(10);
    expect(current[0].props.angle).toBe(0);
    expect(onSpawn).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", type: "fireball" }));
  });

  test("keeps impacted projectiles briefly so components can react", () => {
    const hooks = new Hooks([], "client");
    const manager = new ProjectileManager(hooks);
    manager.register("arrow", () => null);
    manager.spawnBatch([
      {
        id: "p2",
        type: "arrow",
        origin: { x: 0, y: 0 },
        direction: { x: 1, y: 0 },
        speed: 100,
        range: 500,
        ttl: 5,
        spawnTick: 1,
      },
    ]);

    manager.impactBatch([{ id: "p2", x: 42, y: 0, distance: 42 }]);

    const current = manager.current();
    expect(current).toHaveLength(1);
    expect(current[0].props.impact?.x).toBe(42);
    expect(current[0].props.destroyed).toBe(true);
  });

  test("keeps hit destroys briefly even if the destroy packet arrives before impact", () => {
    const hooks = new Hooks([], "client");
    const manager = new ProjectileManager(hooks);
    manager.register("arrow", () => null);
    manager.spawnBatch([
      {
        id: "p3",
        type: "arrow",
        origin: { x: 0, y: 0 },
        direction: { x: 1, y: 0 },
        speed: 100,
        range: 500,
        ttl: 5,
        spawnTick: 1,
      },
    ]);

    manager.destroyBatch([{ id: "p3", reason: "hit", x: 48, y: 0, distance: 48 }]);

    const current = manager.current();
    expect(current).toHaveLength(1);
    expect(current[0].props.impact?.x).toBe(48);
    expect(current[0].props.destroyed).toBe(true);
  });

  test("freezes hit destroys at the authoritative impact position until the impact completes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const hooks = new Hooks([], "client");
    const manager = new ProjectileManager(hooks);
    manager.register("arrow", () => null);
    manager.spawnBatch([
      {
        id: "p4",
        type: "arrow",
        origin: { x: 0, y: 0 },
        direction: { x: 1, y: 0 },
        speed: 100,
        range: 500,
        ttl: 5,
        spawnTick: 1,
      },
    ]);

    vi.setSystemTime(1200);
    manager.destroyBatch([{ id: "p4", reason: "hit", x: 48, y: 0, distance: 48 }]);

    vi.setSystemTime(1300);
    manager.step();
    let current = manager.current();
    expect(current).toHaveLength(1);
    expect(current[0].props.x).toBe(48);
    expect(current[0].props.distance).toBe(48);
    expect(current[0].props.impactProgress).toBeCloseTo(100 / 350, 3);

    vi.setSystemTime(1600);
    manager.step();
    current = manager.current();
    expect(current).toHaveLength(0);
  });
});
