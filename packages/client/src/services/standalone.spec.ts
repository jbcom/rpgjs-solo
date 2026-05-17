import { describe, expect, test, vi } from "vitest";
import { normalizeStandaloneMessage } from "./standalone-message";

describe("standalone websocket bridge", () => {
  test("dispatches mock room object broadcasts to named listeners", () => {
    const onSpawn = vi.fn();
    const object = normalizeStandaloneMessage({
      type: "projectile:spawnBatch",
      value: {
        projectiles: [{ id: "p1", type: "bolt" }],
      },
    });

    if (object.type === "projectile:spawnBatch") {
      onSpawn(object.value);
    }

    expect(onSpawn).toHaveBeenCalledWith({
      projectiles: [{ id: "p1", type: "bolt" }],
    });
  });

  test("still accepts browser-style string messages", () => {
    expect(normalizeStandaloneMessage({
      data: JSON.stringify({
        type: "projectile:spawnBatch",
        value: { projectiles: [] },
      }),
    })).toEqual({
      type: "projectile:spawnBatch",
      value: { projectiles: [] },
    });
  });
});
