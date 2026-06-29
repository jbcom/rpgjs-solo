import { describe, expect, test, vi } from "vitest";
import { set_hitbox } from "../runtime/blocks/executors/set-hitbox";

describe("Studio set hitbox runtime", () => {
  test("updates the target hitbox, physics body, and clients", async () => {
    let value = { w: 32, h: 32 };
    const event = {
      id: "event-1",
      x: () => 10,
      y: () => 20,
      hitbox: Object.assign(() => value, {
        set: vi.fn((next) => {
          value = next;
        }),
      }),
      setHitbox: vi.fn((width, height) => {
        value = { w: width, h: height };
      }),
    };
    const map = {
      getEvent: vi.fn(() => event),
      updateHitbox: vi.fn(),
      broadcast: vi.fn(),
      refreshCharacterHitboxes: vi.fn(),
    };

    await set_hitbox({
      player: null,
      event: null,
      map,
    } as any, {
      eventId: "event-1",
      width: 60,
      height: 60,
    });

    expect(event.setHitbox).toHaveBeenCalledWith(60, 60);
    expect(event.hitbox()).toEqual({ w: 60, h: 60 });
    expect(map.updateHitbox).toHaveBeenCalledWith("event-1", 10, 20, 60, 60);
    expect(map.broadcast).toHaveBeenCalledWith("setHitbox", {
      object: "event-1",
      width: 60,
      height: 60,
    });
    expect(map.refreshCharacterHitboxes).toHaveBeenCalled();
  });

  test("falls back to the hitbox signal when no setHitbox method exists", async () => {
    let value = { w: 32, h: 32 };
    const event = {
      id: "event-1",
      x: 10,
      y: 20,
      hitbox: Object.assign(() => value, {
        set: vi.fn((next) => {
          value = next;
        }),
      }),
    };
    const map = {
      getEvent: vi.fn(() => event),
      updateHitbox: vi.fn(),
      $broadcast: vi.fn(),
    };

    await set_hitbox({
      player: null,
      event: null,
      map,
    } as any, {
      eventId: "event-1",
      width: "48",
      height: 40,
    } as any);

    expect(event.hitbox.set).toHaveBeenCalledWith({ w: 48, h: 40 });
    expect(map.updateHitbox).toHaveBeenCalledWith("event-1", 10, 20, 48, 40);
    expect(map.$broadcast).toHaveBeenCalledWith({
      type: "setHitbox",
      value: {
        object: "event-1",
        width: 48,
        height: 40,
      },
    });
  });
});
