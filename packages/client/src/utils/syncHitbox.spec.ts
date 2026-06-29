import { signal } from "canvasengine";
import { describe, expect, test, vi } from "vitest";
import { load } from "@signe/sync";
import { applySyncedHitboxPayload } from "./syncHitbox";

const createObject = (id: string) => ({
  id,
  x: signal(10),
  y: signal(20),
  hitbox: signal({ w: 32, h: 32 }),
});

describe("applySyncedHitboxPayload", () => {
  test("applies player hitboxes from sync object payloads", () => {
    const player = createObject("player-1");
    const sceneMap = {
      players: () => ({ "player-1": player }),
      events: () => ({}),
      getObjectById: (id: string) => (id === "player-1" ? player : undefined),
      updateHitbox: vi.fn(),
    };
    const payload = {
      players: {
        "player-1": {
          hitbox: { w: 56, h: 50 },
        },
      },
    };

    load(sceneMap, payload, true);
    expect(player.hitbox()).toEqual({ w: 32, h: 32 });

    applySyncedHitboxPayload(sceneMap, payload);

    expect(player.hitbox()).toEqual({ w: 56, h: 50 });
    expect(sceneMap.updateHitbox).toHaveBeenCalledWith("player-1", 10, 20, 56, 50);
  });

  test("accepts Studio width and height hitbox payloads for events", () => {
    const event = createObject("event-1");
    const sceneMap = {
      players: () => ({}),
      events: () => ({ "event-1": event }),
      getObjectById: (id: string) => (id === "event-1" ? event : undefined),
      updateHitbox: vi.fn(),
    };

    applySyncedHitboxPayload(sceneMap, {
      events: {
        "event-1": {
          hitbox: { width: "80", height: 40 },
        },
      },
    });

    expect(event.hitbox()).toEqual({ w: 80, h: 40 });
    expect(sceneMap.updateHitbox).toHaveBeenCalledWith("event-1", 10, 20, 80, 40);
  });

  test("ignores invalid hitbox payloads", () => {
    const player = createObject("player-1");
    const sceneMap = {
      players: () => ({ "player-1": player }),
      events: () => ({}),
      updateHitbox: vi.fn(),
    };

    applySyncedHitboxPayload(sceneMap, {
      players: {
        "player-1": {
          hitbox: { w: 0, h: 40 },
        },
      },
    });

    expect(player.hitbox()).toEqual({ w: 32, h: 32 });
    expect(sceneMap.updateHitbox).not.toHaveBeenCalled();
  });
});
