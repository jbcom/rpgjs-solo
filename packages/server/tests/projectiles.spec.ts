import { describe, expect, test, vi } from "vitest";
import { Hooks, PhysicsEngine, Vector2 } from "@rpgjs/common";
import { RpgMapProjectiles } from "../src/projectiles";

function createMapStub() {
  const broadcasts: any[] = [];
  const onImpact = vi.fn();
  const physic = new PhysicsEngine();
  const target = { id: "target", hp: 100 };
  const owner = { id: "owner" };
  const hooks = new Hooks([{ projectiles: { onImpact } }], "server");

  physic.createStaticObstacle("target", {
    position: new Vector2(100, 0),
    width: 20,
    height: 20,
  });

  const map = {
    physic,
    hooks,
    getTick: () => physic.getTick(),
    getObjectById: (id: string) => id === "target" ? target : undefined,
    getPlayer: (id: string) => id === "owner" ? owner : undefined,
    $broadcast: (message: any) => broadcasts.push(message),
  };

  return {
    map,
    broadcasts,
    onImpact,
  };
}

describe("RpgMapProjectiles", () => {
  test("broadcasts compact spawn batches and server-authoritative impacts", async () => {
    const { map, broadcasts, onImpact } = createMapStub();
    const projectiles = new RpgMapProjectiles(map as any);

    projectiles.emit({
      type: "arrow",
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      trajectory: {
        type: "linear",
        speed: 200,
        range: 300,
        ttl: 2,
      },
      payload: {
        damage: 10,
      },
      params: {
        sprite: "arrow",
      },
    } as any);

    projectiles.step(1);
    await Promise.resolve();

    expect(broadcasts[0]).toMatchObject({
      type: "projectile:spawnBatch",
      value: {
        projectiles: [
          expect.objectContaining({
            type: "arrow",
            params: { sprite: "arrow" },
          }),
        ],
      },
    });
    expect(broadcasts[0].value.projectiles[0].payload).toBeUndefined();
    const impactMessage = broadcasts.find((message) => message.type === "projectile:impactBatch");
    const destroyMessage = broadcasts.find((message) => message.type === "projectile:destroyBatch");
    expect(impactMessage).toBeTruthy();
    expect(destroyMessage).toBeTruthy();
    const impact = impactMessage.value.impacts[0];
    expect(destroyMessage.value.projectiles[0]).toMatchObject({
      id: impact.id,
      reason: "hit",
      targetId: impact.targetId,
      x: impact.x,
      y: impact.y,
      distance: impact.distance,
    });
    expect(onImpact).toHaveBeenCalledWith(expect.objectContaining({
      projectile: expect.objectContaining({
        type: "arrow",
        payload: { damage: 10 },
      }),
      target: expect.objectContaining({ id: "target" }),
    }));
  });

  test("expands repeat emissions into delayed spawn descriptors", () => {
    const { map, broadcasts } = createMapStub();
    const projectiles = new RpgMapProjectiles(map as any);

    projectiles.emit({
      type: "spark",
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      trajectory: {
        type: "linear",
        speed: 100,
        range: 200,
      },
      repeat: {
        count: 3,
        interval: 50,
        spread: 10,
        seed: 1,
      },
    });

    expect(broadcasts[0]).toMatchObject({
      type: "projectile:spawnBatch",
      value: {
        projectiles: [
          expect.objectContaining({ index: 0, count: 3, delay: 0 }),
          expect.objectContaining({ index: 1, count: 3, delay: 0.05 }),
          expect.objectContaining({ index: 2, count: 3, delay: 0.1 }),
        ],
      },
    });
  });

  test("applies top-level precision spread to projectile directions", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const { map, broadcasts } = createMapStub();
    const projectiles = new RpgMapProjectiles(map as any);

    projectiles.emit({
      type: "arrow",
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      spreadDegrees: 20,
      trajectory: {
        type: "linear",
        speed: 100,
        range: 200,
      },
    });

    const direction = broadcasts[0].value.projectiles[0].direction;
    expect(direction.x).toBeCloseTo(Math.cos((10 * Math.PI) / 180), 4);
    expect(direction.y).toBeCloseTo(Math.sin((10 * Math.PI) / 180), 4);
  });

  test("serializes client-safe prediction hints and disables prediction for custom hit filters", () => {
    const { map, broadcasts } = createMapStub();
    const projectiles = new RpgMapProjectiles(map as any);

    projectiles.emit({
      type: "filtered",
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      trajectory: {
        type: "linear",
        speed: 100,
        range: 200,
      },
      collision: {
        collisionMask: 2,
        ignoreOwner: false,
      },
      canHit: () => true,
    });

    expect(broadcasts[0].value.projectiles[0]).toMatchObject({
      type: "filtered",
      collisionMask: 2,
      ignoreOwner: false,
      predictImpact: false,
    });
  });

  test("allows local prediction when a custom hit filter opts in", () => {
    const { map, broadcasts } = createMapStub();
    const projectiles = new RpgMapProjectiles(map as any);

    projectiles.emit({
      type: "filtered",
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      trajectory: {
        type: "linear",
        speed: 100,
        range: 200,
      },
      collision: {
        predictImpact: true,
      },
      canHit: () => true,
    });

    expect(broadcasts[0].value.projectiles[0]).toMatchObject({
      type: "filtered",
      predictImpact: true,
    });
  });
});
