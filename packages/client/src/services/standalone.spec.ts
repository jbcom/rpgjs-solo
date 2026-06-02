// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";
import { Context } from "@signe/di";
import { WebSocketToken } from "./AbstractSocket";
import { provideMmorpg } from "./mmorpg";
import { provideRpg } from "./standalone";
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

  test("marks standalone and MMORPG websocket providers with their runtime mode", () => {
    class Server {}
    const context = new Context();
    const standaloneProvider = provideRpg(Server).find(
      (provider: any) => provider.provide === WebSocketToken,
    ) as any;
    const mmorpgProvider = provideMmorpg({ connectionId: "test-client" }).find(
      (provider: any) => provider.provide === WebSocketToken,
    ) as any;

    expect(standaloneProvider.useFactory(context).mode).toBe("standalone");
    expect(mmorpgProvider.useFactory(context).mode).toBe("mmorpg");
  });
});
