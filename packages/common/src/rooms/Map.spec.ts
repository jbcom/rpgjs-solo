import { signal } from "@signe/reactive";
import { describe, expect, test } from "vitest";
import { EntityState, testCollision } from "@rpgjs/physic";
import { RpgCommonMap } from "./Map";

class TestMap extends RpgCommonMap<any> {
  players = signal<Record<string, any>>({});
  events = signal<Record<string, any>>({});
}

describe("RpgCommonMap static hitboxes", () => {
  test("loads point hitboxes as polygons even when bounds are present", () => {
    const map = new TestMap();
    map.data.set({
      width: 200,
      height: 200,
      hitboxes: [
        {
          id: "triangle",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          points: [
            [0, 0],
            [100, 0],
            [0, 100],
          ],
        },
      ],
    });

    map.loadPhysic();

    const triangle = map.physic.getEntityByUUID("triangle");
    const probe = map.physic.createEntity({
      uuid: "probe",
      position: { x: 90, y: 90 },
      width: 8,
      height: 8,
      mass: 1,
      state: EntityState.Dynamic,
    });

    expect(triangle).toBeDefined();
    expect(testCollision(triangle!, probe)).toBeNull();
  });

  test("updates existing event physics bodies from synced hitbox signals", () => {
    const map = new TestMap();
    const event = {
      id: "wide-event",
      x: signal(100),
      y: signal(120),
      z: signal(0),
      hitbox: signal({ w: 32, h: 32 }),
      _removeTransition: signal(false),
    };

    map.data.set({
      width: 200,
      height: 200,
      hitboxes: [],
    });
    map.events.set({
      "wide-event": event,
    });
    map.loadPhysic();

    expect(map.getBody("wide-event")?.width).toBe(32);
    expect(map.getBody("wide-event")?.height).toBe(32);

    event.hitbox.set({ w: 56, h: 50 });

    expect(map.getBody("wide-event")?.width).toBe(56);
    expect(map.getBody("wide-event")?.height).toBe(50);
  });

  test("loads event physics bodies from Studio width and height hitbox data", () => {
    const map = new TestMap();
    const event = {
      id: "studio-event",
      x: signal(100),
      y: signal(120),
      z: signal(0),
      hitbox: signal({ width: 56, height: 50 }),
      _removeTransition: signal(false),
    };

    map.data.set({
      width: 200,
      height: 200,
      hitboxes: [],
    });
    map.events.set({
      "studio-event": event,
    });
    map.loadPhysic();

    expect(map.getBody("studio-event")?.width).toBe(56);
    expect(map.getBody("studio-event")?.height).toBe(50);
  });
});
