import { describe, expect, it } from "vitest";
import { buildStudioTerrainCollisionPolygons } from "./collision-polygons";
import { createStudioTerrainRenderData } from "./map-normalizer";
import {
  resolveTerrainTextureSourceRect,
  resolveTerrainTileAtlasSourceRect,
} from "./terrain-renderer/terrain-texture";

const terrainMedia = {
  id: "terrain",
  fileName: "terrain.png",
  metadata: {
    textureGrid: { columns: 2, rows: 1, tileSize: 48 },
    terrainTextures: [
      { id: "grass", index: 0, label: "Grass", collision: false },
      { id: "water", index: 1, label: "Water", collision: true },
    ],
  },
};

const tileAtlasTerrainMedia = {
  id: "terrain-atlas",
  fileName: "terrain-atlas.png",
  metadata: {
    sourceTexture: "source-texture.png",
    textureGrid: { columns: 2, rows: 2, tileSize: 48 },
    tilewidth: 48,
    tileheight: 48,
    tilecount: 256,
    terrainTextures: [
      { id: "terrain-0", index: 0, label: "Terrain 1", collision: false },
      { id: "terrain-1", index: 1, label: "Terrain 2", collision: false },
      { id: "terrain-2", index: 2, label: "Terrain 3", collision: false },
      { id: "terrain-3", index: 3, label: "Terrain 4", collision: false },
    ],
  },
};

function createMap(overrides: Record<string, unknown> = {}) {
  return {
    _id: "map",
    creationDetails: { version: "v2" },
    params: {
      width: 4,
      height: 3,
      baseTerrain: terrainMedia,
      primaryTerrainTileset: terrainMedia,
      terrainTilesets: [terrainMedia],
    },
    terrain: JSON.stringify([
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ]),
    ...overrides,
  };
}

describe("studio terrain map renderer data", () => {
  it("normalizes empty v2 maps with a full fallback terrain grid", () => {
    const data = createStudioTerrainRenderData(createMap({ terrain: undefined }));

    expect(data.widthTiles).toBe(4);
    expect(data.heightTiles).toBe(3);
    expect(data.terrainGrid).toHaveLength(3);
    expect(data.terrainGrid[0]).toHaveLength(4);
    expect(data.terrainGrid[0][0]).toMatchObject({
      terrainTextureId: "grass",
      collision: false,
    });
  });

  it("normalizes Studio control texture terrain layers", () => {
    const data = createStudioTerrainRenderData(
      createMap({
        terrainLayer: {
          version: 1,
          mode: "control-texture",
          width: 192,
          height: 144,
          tileSize: 48,
          palette: ["water", "grass"],
          controlTexture: {
            fileName: "control.png",
            encoding: "rgba8",
          },
        },
      })
    );

    expect(data.terrainControl).toMatchObject({
      source: expect.stringContaining("control.png"),
      width: 192,
      height: 144,
      tileSize: 48,
      palette: ["water", "grass"],
    });
  });

  it("uses the source image dimensions when terrain atlas metadata is compact", () => {
    const asset = createStudioTerrainRenderData(createMap()).asset!;
    const rect = resolveTerrainTextureSourceRect(asset, asset.terrainTextures[1], 1254, 1254);

    expect(rect).toMatchObject({
      x: 627,
      y: 0,
      width: 627,
      height: 627,
    });
  });

  it("keeps numeric tile grids as tile-atlas cells when the terrain media is an atlas", () => {
    const data = createStudioTerrainRenderData(
      createMap({
        params: {
          width: 2,
          height: 1,
          baseTerrain: tileAtlasTerrainMedia,
          primaryTerrainTileset: tileAtlasTerrainMedia,
          terrainTilesets: [tileAtlasTerrainMedia],
        },
        terrain: JSON.stringify([[8, 0]]),
      })
    );

    expect(data.sourceTexture).toContain("terrain-atlas.png");
    expect(data.sourceTexture).not.toContain("source-texture.png");
    expect(data.terrainGrid[0][0]).toMatchObject({
      source: "tile-atlas",
      tileId: 8,
    });
    expect(data.terrainGrid[0][1]).toMatchObject({
      source: "tile-atlas",
      tileId: 0,
    });
  });

  it("resolves tile atlas source rectangles from the loaded image dimensions", () => {
    const asset = createStudioTerrainRenderData(
      createMap({
        params: {
          baseTerrain: tileAtlasTerrainMedia,
          primaryTerrainTileset: tileAtlasTerrainMedia,
          terrainTilesets: [tileAtlasTerrainMedia],
        },
        terrain: JSON.stringify([[255]]),
      })
    ).asset!;

    expect(resolveTerrainTileAtlasSourceRect(asset, 8, 2400, 288)).toMatchObject({
      x: 384,
      y: 0,
      width: 48,
      height: 48,
    });
    expect(resolveTerrainTileAtlasSourceRect(asset, 255, 2400, 288)).toMatchObject({
      x: 240,
      y: 240,
      width: 48,
      height: 48,
    });
  });
});

describe("buildStudioTerrainCollisionPolygons", () => {
  it("merges adjacent terrain collision cells into one polygon", () => {
    const polygons = buildStudioTerrainCollisionPolygons(createMap());

    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toMatchObject({
      type: "terrain_collision",
      x: 48,
      y: 0,
      width: 96,
      height: 96,
    });
    expect(polygons[0].points).toEqual([
      [48, 0],
      [144, 0],
      [144, 96],
      [48, 96],
    ]);
  });

  it("creates edge collisions for hole borders while leaving the interior rule separate", () => {
    const polygons = buildStudioTerrainCollisionPolygons(
      createMap({
        terrain: JSON.stringify([
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ]),
        terrainMorphologyLayer: {
          version: 1,
          mode: "terrain-morphology",
          width: 192,
          height: 144,
          tileSize: 48,
          features: [
            {
              id: "hole-1",
              kind: "hole",
              params: { depth: 64, fillHeight: 50 },
              strokes: [
                {
                  id: "stroke-1",
                  points: [{ x: 96, y: 72 }],
                  radius: 54,
                },
              ],
            },
          ],
        },
      })
    );

    expect(polygons.some((polygon) => polygon.type === "morphology_hole_edge_collision")).toBe(true);
    expect(polygons.every((polygon) => polygon.width > 0 && polygon.height > 0)).toBe(true);
  });

  it("creates edge collisions for wall borders instead of blocking the whole top surface", () => {
    const polygons = buildStudioTerrainCollisionPolygons(
      createMap({
        terrain: JSON.stringify([
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ]),
        terrainMorphologyLayer: {
          version: 1,
          mode: "terrain-morphology",
          width: 192,
          height: 144,
          tileSize: 48,
          features: [
            {
              id: "wall-1",
              kind: "wall",
              params: { height: 48 },
              strokes: [
                {
                  id: "stroke-1",
                  points: [
                    { x: 48, y: 72 },
                    { x: 144, y: 72 },
                  ],
                  radius: 42,
                },
              ],
            },
          ],
        },
      })
    );

    expect(polygons.some((polygon) => polygon.type === "morphology_wall_edge_collision")).toBe(true);
    expect(polygons.every((polygon) => polygon.points.length >= 4)).toBe(true);
  });

  it("pushes the far wall border collision down to allow visual overlap with the top surface", () => {
    const polygons = buildStudioTerrainCollisionPolygons(
      createMap({
        params: {
          ...createMap().params,
          width: 5,
          height: 4,
        },
        terrain: JSON.stringify([
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ]),
        terrainMorphologyLayer: {
          version: 1,
          mode: "terrain-morphology",
          width: 240,
          height: 192,
          tileSize: 48,
          features: [
            {
              id: "wall-offset",
              kind: "wall",
              params: { height: 56 },
              strokes: [
                {
                  id: "stroke-1",
                  points: [
                    { x: 72, y: 72 },
                    { x: 168, y: 72 },
                  ],
                  radius: 42,
                },
              ],
            },
          ],
        },
      })
    );

    const wallPolygons = polygons.filter((polygon) => polygon.type === "morphology_wall_edge_collision");

    expect(wallPolygons.length).toBeGreaterThan(0);
    expect(wallPolygons.some((polygon) => polygon.y === 0)).toBe(false);
    expect(wallPolygons.some((polygon) => polygon.y >= 48)).toBe(true);
  });
});
