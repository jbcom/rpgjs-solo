import { describe, expect, it, vi } from "vitest";

vi.mock("@canvasengine/tiled", () => {
  class MapClass {
    width: number;
    height: number;
    tilewidth: number;
    tileheight: number;
    widthPx: number;
    heightPx: number;
    private blockedTiles: Set<string>;

    constructor(parsedMap: any) {
      this.width = parsedMap.width ?? 0;
      this.height = parsedMap.height ?? 0;
      this.tilewidth = parsedMap.tilewidth ?? 32;
      this.tileheight = parsedMap.tileheight ?? 32;
      this.widthPx = this.width * this.tilewidth;
      this.heightPx = this.height * this.tileheight;
      this.blockedTiles = new Set(parsedMap.blockedTiles ?? []);
    }

    getTileByPosition(x: number, y: number) {
      const tileX = Math.floor(x / this.tilewidth);
      const tileY = Math.floor(y / this.tileheight);
      return {
        hasCollision: this.blockedTiles.has(`${tileX},${tileY}`),
      };
    }
  }

  return { MapClass };
});

import { prepareTiledPhysicsData } from "./physics";

describe("prepareTiledPhysicsData", () => {
  it("adds tiled collision hitboxes without duplicating them on repeated preparation", () => {
    const mapData = {
      parsedMap: {
        width: 3,
        height: 2,
        tilewidth: 16,
        tileheight: 20,
        blockedTiles: ["1,0", "2,1"],
      },
      hitboxes: [{ id: "custom-hitbox", x: 4, y: 5, width: 6, height: 7 }],
    };
    const map: any = {};
    const expectedHitboxes = [
      { id: "custom-hitbox", x: 4, y: 5, width: 6, height: 7 },
      { id: "__tiled_collision__:1,0", x: 16, y: 0, width: 16, height: 20 },
      { id: "__tiled_collision__:2,1", x: 32, y: 20, width: 16, height: 20 },
    ];

    prepareTiledPhysicsData(mapData, map);

    expect(mapData.width).toBe(48);
    expect(mapData.height).toBe(40);
    expect(mapData.hitboxes).toEqual(expectedHitboxes);

    prepareTiledPhysicsData(mapData, map);

    expect(mapData.hitboxes).toEqual(expectedHitboxes);
  });

  it("removes stale generated tiled hitboxes when blocked tiles change", () => {
    const mapData = {
      parsedMap: {
        width: 2,
        height: 1,
        tilewidth: 32,
        tileheight: 32,
        blockedTiles: ["0,0"],
      },
      hitboxes: [],
    };
    const map: any = {};

    prepareTiledPhysicsData(mapData, map);
    expect(mapData.hitboxes).toEqual([
      { id: "__tiled_collision__:0,0", x: 0, y: 0, width: 32, height: 32 },
    ]);

    mapData.parsedMap.blockedTiles = [];
    prepareTiledPhysicsData(mapData, map);

    expect(mapData.hitboxes).toEqual([]);
  });
});
