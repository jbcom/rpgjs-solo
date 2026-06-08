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
});
