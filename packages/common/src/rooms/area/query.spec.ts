import { signal } from "@signe/reactive";
import { describe, expect, test, vi } from "vitest";
import {
  RpgCommonMap,
  type MapHitboxQueryOptions,
  type MapHitboxQueryRect,
} from "../Map";
import { AreaShape } from ".";

class TestMap extends RpgCommonMap<any> {
  players = signal<Record<string, any>>({});
  events = signal<Record<string, any>>({});
  lastQuery?: { rect: MapHitboxQueryRect; options: MapHitboxQueryOptions };

  constructor(private readonly hitboxResults: any[] = []) {
    super();
  }

  queryHitbox(rect: MapHitboxQueryRect, options: MapHitboxQueryOptions = {}) {
    this.lastQuery = { rect, options };
    return this.hitboxResults;
  }
}

const actor = (id: string, x: number, y: number, width = 32, height = 32) => ({
  id,
  x: () => x,
  y: () => y,
  hitbox: () => ({ w: width, h: height }),
});

describe("RpgCommonMap.queryArea", () => {
  test("uses shape bounds as broad phase and filters circle hits precisely", () => {
    const near = actor("near", 104, 100);
    const far = actor("far", 200, 100);
    const map = new TestMap([near, far]);
    map.players.set({ near, far });

    const hits = map.queryArea({
      center: { x: 100, y: 100 },
      shape: AreaShape.circle({ radius: 48 }),
      targets: "players",
    });

    expect(map.lastQuery).toEqual({
      rect: { x: 52, y: 52, width: 96, height: 96 },
      options: { excludeIds: undefined, kinds: ["players"] },
    });
    expect(hits.map((hit) => hit.id)).toEqual(["near"]);
    expect(hits[0].kind).toBe("players");
    expect(hits[0].distance).toBeCloseTo(Math.hypot(20, 16));
    expect(hits[0].falloff.linear()).toBeCloseTo(1 - hits[0].distanceRatio);
  });

  test("supports custom shapes and custom targets", () => {
    const projectiles = [
      { id: "inner", x: 105, y: 100 },
      { id: "ring", x: 170, y: 100 },
      { id: "outer", x: 260, y: 100 },
    ];
    const contains = vi.fn((target: any, { center }: any) => {
      const distance = Math.hypot(target.x - center.x, target.y - center.y);
      return distance >= 48 && distance <= 96;
    });
    const map = new TestMap();

    const hits = map.queryArea({
      center: { x: 100, y: 100 },
      shape: AreaShape.custom({
        bounds: ({ center }) => ({
          x: center.x - 96,
          y: center.y - 96,
          width: 192,
          height: 192,
        }),
        contains,
        maxDistance: () => 96,
      }),
      targets: "custom",
      customTargets: projectiles,
    });

    expect(map.lastQuery).toBeUndefined();
    expect(contains).toHaveBeenCalled();
    expect(hits.map((hit) => [hit.id, hit.kind])).toEqual([["ring", "custom"]]);
    expect(hits[0].distanceRatio).toBeCloseTo(70 / 96);
  });

  test("deduplicates candidates and supports cross shapes, exclusions, and filters", () => {
    const first = actor("first", 84, 100);
    const duplicate = first;
    const second = actor("second", 100, 164);
    const excluded = actor("excluded", 100, 100);
    const map = new TestMap([first, duplicate, second, excluded]);
    map.events.set({ first, second, excluded });

    const hits = map.queryArea({
      center: { x: 100, y: 100 },
      shape: AreaShape.cross({ armLength: 80, thickness: 32 }),
      targets: "events",
      excludeIds: ["excluded"],
      filter: (candidate) => candidate.id !== "second",
    });

    expect(map.lastQuery?.options).toEqual({
      excludeIds: ["excluded"],
      kinds: ["events"],
    });
    expect(hits.map((hit) => hit.id)).toEqual(["first"]);
  });
});
