import { PhysicsEngine, Vector2 } from "@rpgjs/common";
import { describe, expect, test } from "vitest";
import type { ClientProjectileSpawn } from "./ProjectileManager";
import { predictClientProjectileImpact } from "./ProjectilePrediction";

const projectile = (radius?: number): ClientProjectileSpawn => ({
  id: "grazing-bolt",
  type: "bolt",
  origin: { x: 0, y: 0 },
  direction: { x: 1, y: 0 },
  speed: 100,
  range: 200,
  ttl: 2,
  spawnTick: 1,
  radius,
});

describe("client projectile prediction", () => {
  test("matches the authoritative capsule cast for a grazing radius hit", () => {
    const physics = new PhysicsEngine({ spatialCellSize: 8 });
    physics.createStaticObstacle("grazing-target", {
      x: 100,
      y: 15,
      width: 20,
      height: 20,
    });
    const expected = physics.capsuleCast(
      new Vector2(0, 0),
      new Vector2(1, 0),
      200,
      5,
    );

    expect(physics.raycast(
      new Vector2(0, 0),
      new Vector2(1, 0),
      200,
    )).toBeNull();
    expect(expected).not.toBeNull();
    expect(predictClientProjectileImpact(physics, projectile(5))).toEqual({
      id: "grazing-bolt",
      targetId: expected!.entity.uuid,
      x: expected!.point.x,
      y: expected!.point.y,
      distance: expected!.distance,
    });
    expect(predictClientProjectileImpact(physics, projectile(0))).toBeNull();
  });
});
