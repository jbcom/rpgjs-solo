export const STUDIO_TERRAIN_TILE_SIZE = 48;

export type TerrainRenderMode =
  | { type: "hard" }
  | { type: "fade"; width?: number; curve?: "linear" | "smooth" | "sharp" }
  | { type: "water"; border?: boolean; foam?: boolean }
  | { type: "custom"; shaderKey: string; params?: Record<string, unknown> };

export interface TerrainTextureMetadata {
  id: string;
  index: number;
  label: string;
  collision?: boolean;
  renderTileSize?: number;
  specialType?: string;
  defaultRenderMode?: TerrainRenderMode;
}

export interface TerrainTextureGridMetadata {
  columns: number;
  rows: number;
  tileSize: number;
}

export interface TerrainTransitionRule {
  from: string;
  to: string;
  mode: TerrainRenderMode;
  priority?: number;
}

export interface TerrainAssetMetadata {
  sourceTexture: string;
  tileAtlas: TerrainTileAtlasMetadata | null;
  textureGrid: TerrainTextureGridMetadata;
  terrainTextures: TerrainTextureMetadata[];
  transitions: TerrainTransitionRule[];
}

export interface TerrainTileAtlasMetadata {
  source: string;
  tileWidth: number;
  tileHeight: number;
  columns?: number;
  tileCount?: number;
}

export interface StudioTerrainCell {
  source: "terrain-texture" | "tile-atlas";
  terrainTextureId: string;
  textureIndex: number;
  collision: boolean;
  tileId?: number;
}

export interface StudioTerrainStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  radius: number;
}

export interface StudioTerrainMorphologyFeature {
  id: string;
  kind: "hole" | "wall";
  params: Record<string, unknown>;
  strokes: StudioTerrainStroke[];
}

export interface StudioTerrainRenderData {
  widthTiles: number;
  heightTiles: number;
  tileSize: number;
  width: number;
  height: number;
  asset: TerrainAssetMetadata | null;
  sourceTexture: string;
  terrainControl: StudioTerrainControlTexture | null;
  terrainGrid: StudioTerrainCell[][];
  morphologyFeatures: StudioTerrainMorphologyFeature[];
  version: string;
}

export interface StudioTerrainControlTexture {
  source: string;
  width: number;
  height: number;
  tileSize: number;
  palette: string[];
  encoding?: string;
}

export interface StudioCollisionPolygon {
  id: string;
  type:
    | "terrain_collision"
    | "morphology_hole_edge_collision"
    | "morphology_wall_edge_collision";
  x: number;
  y: number;
  width: number;
  height: number;
  points: Array<[number, number]>;
  properties?: Record<string, unknown>;
}

export interface TerrainSourceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
