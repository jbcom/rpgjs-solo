import { describe, expect, test, vi } from "vitest";
import { set_hitbox } from "../runtime/blocks/executors/set-hitbox";

describe("Studio set hitbox runtime", () => {
  test("updates the target hitbox and physics body", async () => {
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
      syncChanges: vi.fn(),
      events: Object.assign(() => ({ "event-1": event }), {
        mutate: vi.fn((fn) => fn({ "event-1": event })),
      }),
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
    expect(map.events.mutate).toHaveBeenCalled();
    expect(map.syncChanges).toHaveBeenCalled();
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
      syncChanges: vi.fn(),
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
    expect(map.syncChanges).toHaveBeenCalled();
  });

  test("falls back to player sync when map sync is unavailable", async () => {
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
    const player = {
      syncChanges: vi.fn(),
    };
    const map = {
      getEvent: vi.fn(() => event),
      updateHitbox: vi.fn(),
    };

    await set_hitbox({
      player,
      event: null,
      map,
    } as any, {
      eventId: "event-1",
      width: 48,
      height: 40,
    });

    expect(event.hitbox()).toEqual({ w: 48, h: 40 });
    expect(player.syncChanges).toHaveBeenCalled();
  });
});
