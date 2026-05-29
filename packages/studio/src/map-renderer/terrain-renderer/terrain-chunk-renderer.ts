import { Container as PixiContainer, Sprite, Texture } from "pixi.js";
import { buildStudioTerrainCollisionPolygons } from "../collision-polygons";
import { createStudioTerrainRenderData } from "../map-normalizer";
import {
  STUDIO_TERRAIN_TILE_SIZE,
  type TerrainAssetMetadata,
  type TerrainRenderMode,
  type StudioCollisionPolygon,
  type StudioTerrainControlTexture,
  type StudioTerrainMorphologyFeature,
  type StudioTerrainRenderData,
} from "../types";
import {
  createMirroredTerrainPatternCanvas,
  findTerrainTexture,
  getTerrainRenderMode,
  resolveEffectiveTerrainTextureGrid,
  resolveTerrainTextureSourceRect,
} from "./terrain-texture";

const DEFAULT_CHUNK_SIZE = 768;
const SOLID_BLACK_TERRAIN_TEXTURE_ID = "__solid_black__";

interface TerrainChunk {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  texture: Texture;
  sprite: Sprite;
}

interface ImageBuffer {
  key: string;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface TerrainControlLayer {
  terrainTextureId: string;
  paletteIndex: number;
  source: { x: number; y: number; width: number; height: number };
}

interface TerrainControlRenderLayer {
  terrainTextureId: string;
  paletteIndex: number;
  priority: number;
  blendRadius: number;
  mode: TerrainRenderMode;
}

interface TerrainCompositeLayer {
  pixels: Uint8ClampedArray;
  mask: Uint8ClampedArray;
}

interface CanvasBuffer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

interface TerrainMorphologyMaskBuffer {
  canvas: HTMLCanvasElement;
  bounds: { x: number; y: number; width: number; height: number };
}

interface TerrainWallRenderParts {
  mask: TerrainMorphologyMaskBuffer;
  topEdge: TerrainMorphologyMaskBuffer;
  bottomEdge: TerrainMorphologyMaskBuffer;
  faceMask: TerrainMorphologyMaskBuffer;
  leftEdge: TerrainMorphologyMaskBuffer;
  rightEdge: TerrainMorphologyMaskBuffer;
  smoothness: number;
  height: number;
}

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface StudioTerrainChunkRendererOptions {
  chunkSize?: number;
  debugCollisions?: boolean;
  splitWallForeground?: boolean;
}

export class StudioTerrainChunkRenderer {
  private readonly world: PixiContainer;
  private readonly chunkSize: number;
  private chunks = new Map<string, TerrainChunk>();
  private imageCache = new Map<string, Promise<HTMLImageElement | null>>();
  private loadedImages = new Map<string, HTMLImageElement>();
  private imageBufferCache = new Map<string, ImageBuffer>();
  private patternCache = new Map<string, HTMLCanvasElement>();
  private renderVersion = "";
  private destroyed = false;

  constructor(world: PixiContainer, options: StudioTerrainChunkRendererOptions = {}) {
    this.world = world;
    this.chunkSize = Math.max(STUDIO_TERRAIN_TILE_SIZE, options.chunkSize ?? DEFAULT_CHUNK_SIZE);
    this.world.sortableChildren = true;
  }

  async renderMap(map: any, options: StudioTerrainChunkRendererOptions = {}): Promise<void> {
    if (this.destroyed || typeof document === "undefined") return;
    const data = isStudioTerrainRenderData(map?.terrainRenderData)
      ? map.terrainRenderData
      : createStudioTerrainRenderData(map);
    const debugCollisions = options.debugCollisions === true;
    const splitWallForeground = options.splitWallForeground === true;
    const version = `${data.version}|debug:${debugCollisions}|chunk:${this.chunkSize}|splitWall:${splitWallForeground}`;
    if (version === this.renderVersion && this.chunks.size > 0) return;
    this.renderVersion = version;

    const image = data.sourceTexture ? this.loadedImages.get(data.sourceTexture) ?? null : null;
    const controlImage = data.terrainControl?.source
      ? this.loadedImages.get(data.terrainControl.source) ?? null
      : null;

    const nextKeys = new Set<string>();
    const collisions = debugCollisions ? buildStudioTerrainCollisionPolygons(map) : [];
    const columns = Math.max(1, Math.ceil(data.width / this.chunkSize));
    const rows = Math.max(1, Math.ceil(data.height / this.chunkSize));

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * this.chunkSize;
        const y = row * this.chunkSize;
        const width = Math.min(this.chunkSize, data.width - x);
        const height = Math.min(this.chunkSize, data.height - y);
        const key = `${column}:${row}`;
        nextKeys.add(key);
        this.renderChunk(key, data, image, controlImage, { x, y, width, height }, collisions, splitWallForeground);
      }
    }

    if (data.sourceTexture && !image) {
      void this.loadImage(data.sourceTexture).then((loadedImage) => {
        if (!loadedImage || this.destroyed) return;
        this.renderVersion = "";
        void this.renderMap(map, options);
      });
    }
    if (data.terrainControl?.source && !controlImage) {
      void this.loadImage(data.terrainControl.source).then((loadedImage) => {
        if (!loadedImage || this.destroyed) return;
        this.renderVersion = "";
        void this.renderMap(map, options);
      });
    }

    for (const [key, chunk] of this.chunks) {
      if (!nextKeys.has(key)) {
        chunk.sprite.destroy({ texture: true });
        this.chunks.delete(key);
      }
    }
  }

  invalidateTerrain(bounds?: { x: number; y: number; width: number; height: number }): void {
    if (!bounds) {
      this.renderVersion = "";
      return;
    }
    const minX = Math.floor(bounds.x / this.chunkSize);
    const minY = Math.floor(bounds.y / this.chunkSize);
    const maxX = Math.floor((bounds.x + bounds.width) / this.chunkSize);
    const maxY = Math.floor((bounds.y + bounds.height) / this.chunkSize);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const chunk = this.chunks.get(`${x}:${y}`);
        if (chunk) {
          chunk.sprite.destroy({ texture: true });
          this.chunks.delete(chunk.key);
        }
      }
    }
    this.renderVersion = "";
  }

  destroy(): void {
    this.destroyed = true;
    for (const chunk of this.chunks.values()) {
      chunk.sprite.destroy({ texture: true });
    }
    this.chunks.clear();
    this.patternCache.clear();
    this.imageBufferCache.clear();
    this.world.removeChildren();
  }

  async createWallOcclusionSprites(map: any, options: { sliceWidth?: number } = {}): Promise<Sprite[]> {
    if (this.destroyed || typeof document === "undefined") return [];
    const data = isStudioTerrainRenderData(map?.terrainRenderData)
      ? map.terrainRenderData
      : createStudioTerrainRenderData(map);
    const image = data.sourceTexture ? await this.loadImage(data.sourceTexture) : null;
    const sliceWidth = Math.max(12, Math.round(options.sliceWidth ?? data.tileSize / 2));
    const sprites: Sprite[] = [];

    for (const feature of data.morphologyFeatures) {
      if (feature.kind !== "wall") continue;
      const parts = this.createTerrainWallRenderParts(data, feature);
      if (!parts) continue;
      const rendered = this.createCanvasBuffer(parts.mask.canvas.width, parts.mask.canvas.height, true);
      rendered.ctx.save();
      rendered.ctx.translate(-parts.mask.bounds.x, -parts.mask.bounds.y);
      this.drawWallBase(rendered.ctx, data, image, feature, parts);
      this.drawWallForeground(rendered.ctx, data, image, feature, parts);
      rendered.ctx.restore();

      sprites.push(...this.createWallOcclusionSliceSprites(rendered.canvas, parts.mask, feature, sliceWidth));
    }

    return sprites;
  }

  private renderChunk(
    key: string,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    controlImage: HTMLImageElement | null,
    bounds: { x: number; y: number; width: number; height: number },
    collisions: StudioCollisionPolygon[],
    splitWallForeground: boolean
  ): void {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(bounds.width));
    canvas.height = Math.max(1, Math.ceil(bounds.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.translate(-bounds.x, -bounds.y);
    const renderedControlTerrain = this.drawTerrainControlTexture(ctx, data, image, controlImage, bounds);
    if (!renderedControlTerrain) {
      this.drawBaseTerrain(ctx, data, image, bounds);
      this.drawTerrainTransitions(ctx, data, bounds);
    }
    this.drawMorphology(ctx, data, image, bounds, splitWallForeground);
    this.drawDebugCollisions(ctx, collisions, bounds);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const texture = Texture.from(canvas);
    setNearestTextureScale(texture);
    const sprite = new Sprite(texture);
    sprite.x = Math.round(bounds.x);
    sprite.y = Math.round(bounds.y);
    sprite.zIndex = 0;
    sprite.roundPixels = true;

    const previous = this.chunks.get(key);
    if (previous) {
      const index = this.world.getChildIndex(previous.sprite);
      previous.sprite.destroy({ texture: true });
      this.world.addChildAt(sprite, Math.max(0, index));
    } else {
      this.world.addChild(sprite);
    }

    this.chunks.set(key, {
      key,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      canvas,
      texture,
      sprite,
    });
  }

  private drawBaseTerrain(
    ctx: CanvasRenderingContext2D,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    bounds: { x: number; y: number; width: number; height: number }
  ): void {
    const tileSize = data.tileSize;
    const minTileX = Math.max(0, Math.floor(bounds.x / tileSize));
    const minTileY = Math.max(0, Math.floor(bounds.y / tileSize));
    const maxTileX = Math.min(data.widthTiles - 1, Math.floor((bounds.x + bounds.width) / tileSize));
    const maxTileY = Math.min(data.heightTiles - 1, Math.floor((bounds.y + bounds.height) / tileSize));

    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        const cell = data.terrainGrid[tileY]?.[tileX];
        const texture = findTerrainTexture(data.asset, cell?.terrainTextureId ?? cell?.textureIndex);
        if (!texture && !image) {
          this.fillTerrainRect(
            ctx,
            data,
            image,
            cell?.terrainTextureId ?? `terrain-${cell?.textureIndex ?? 0}`,
            tileX * tileSize,
            tileY * tileSize,
            tileSize,
            tileSize
          );
          continue;
        }
        this.fillTerrainRect(
          ctx,
          data,
          image,
          texture?.id ?? cell?.terrainTextureId ?? "terrain-0",
          tileX * tileSize,
          tileY * tileSize,
          tileSize,
          tileSize
        );
      }
    }
  }

  private drawTerrainTransitions(
    ctx: CanvasRenderingContext2D,
    data: StudioTerrainRenderData,
    bounds: { x: number; y: number; width: number; height: number }
  ): void {
    const tileSize = data.tileSize;
    const minTileX = Math.max(0, Math.floor(bounds.x / tileSize) - 1);
    const minTileY = Math.max(0, Math.floor(bounds.y / tileSize) - 1);
    const maxTileX = Math.min(data.widthTiles - 1, Math.floor((bounds.x + bounds.width) / tileSize) + 1);
    const maxTileY = Math.min(data.heightTiles - 1, Math.floor((bounds.y + bounds.height) / tileSize) + 1);

    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        const cell = data.terrainGrid[tileY]?.[tileX];
        if (!cell) continue;
        const texture = findTerrainTexture(data.asset, cell.terrainTextureId);
        const mode = getTerrainRenderMode(texture);
        const fadeWidth = mode.type === "fade" ? Math.max(1, Number(mode.width ?? 18)) : 0;
        if (mode.type === "hard" || fadeWidth <= 0) continue;

        const x = tileX * tileSize;
        const y = tileY * tileSize;
        const neighbors = [
          { dx: 0, dy: -1, edge: "top" },
          { dx: 1, dy: 0, edge: "right" },
          { dx: 0, dy: 1, edge: "bottom" },
          { dx: -1, dy: 0, edge: "left" },
        ] as const;
        for (const neighbor of neighbors) {
          const other = data.terrainGrid[tileY + neighbor.dy]?.[tileX + neighbor.dx];
          if (!other || other.terrainTextureId === cell.terrainTextureId) continue;
          this.drawFadeEdge(ctx, x, y, tileSize, fadeWidth, neighbor.edge);
        }
      }
    }
  }

  private drawMorphology(
    ctx: CanvasRenderingContext2D,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    bounds: { x: number; y: number; width: number; height: number },
    splitWallForeground: boolean
  ): void {
    for (const feature of data.morphologyFeatures) {
      if (!featureIntersectsBounds(feature, bounds)) continue;
      if (feature.kind === "hole") {
        this.drawHole(ctx, data, image, feature);
      } else {
        if (splitWallForeground) {
          continue;
        } else {
          this.drawWall(ctx, data, image, feature);
        }
      }
    }
  }

  private drawTerrainControlTexture(
    ctx: CanvasRenderingContext2D,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    controlImage: HTMLImageElement | null,
    bounds: { x: number; y: number; width: number; height: number }
  ): boolean {
    const control = data.terrainControl;
    if (!control || !data.asset || !image || !controlImage || control.palette.length === 0) {
      return false;
    }

    const controlBuffer = this.getImageBuffer(control.source, controlImage);
    if (!controlBuffer) return false;

    const layers = createTerrainControlRenderLayers(data.asset, control.palette);
    if (layers.length === 0) return false;

    const margin = Math.ceil(Math.max(24, ...layers.map((layer) => layer.blendRadius + 8)));
    const renderBounds = intersectBounds(
      {
        x: Math.floor(bounds.x - margin),
        y: Math.floor(bounds.y - margin),
        width: Math.ceil(bounds.width + margin * 2),
        height: Math.ceil(bounds.height + margin * 2),
      },
      { x: 0, y: 0, width: control.width, height: control.height }
    );
    if (!renderBounds) return false;

    const width = Math.max(1, Math.ceil(renderBounds.width));
    const height = Math.max(1, Math.ceil(renderBounds.height));
    const composites: TerrainCompositeLayer[] = [];

    for (const layer of layers) {
      const rawMask = this.buildTerrainControlRawMask(controlBuffer, control, layer.paletteIndex, renderBounds);
      const softMask = this.buildTerrainControlMaskFromRaw(rawMask, layer.blendRadius);
      this.applyHardTerrainControlCutouts(softMask, controlBuffer, control, data.asset, layers, layer, renderBounds);

      const fill = this.createCanvasBuffer(width, height, true);
      if (!this.fillTerrainPatternInBounds(fill.ctx, data, image, layer.terrainTextureId, renderBounds)) {
        fill.ctx.fillStyle = fallbackTerrainColor(layer.terrainTextureId);
        fill.ctx.fillRect(0, 0, width, height);
      }

      composites.push({
        pixels: fill.ctx.getImageData(0, 0, width, height).data,
        mask: softMask.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, width, height).data,
      });
    }

    if (composites.length === 0) return false;

    const output = this.createCanvasBuffer(width, height);
    const imageData = output.ctx.createImageData(width, height);
    imageData.data.set(composeTerrainLayerPixels(width, height, composites));
    output.ctx.putImageData(imageData, 0, 0);
    this.drawTerrainLayerEffects(output, control, layers, renderBounds);

    ctx.drawImage(output.canvas, renderBounds.x, renderBounds.y);
    return true;
  }

  private buildTerrainControlRawMask(
    controlBuffer: ImageBuffer,
    control: StudioTerrainControlTexture,
    paletteIndex: number,
    bounds: { x: number; y: number; width: number; height: number }
  ): HTMLCanvasElement {
    const width = Math.max(1, Math.ceil(bounds.width));
    const height = Math.max(1, Math.ceil(bounds.height));
    const buffer = this.createCanvasBuffer(width, height);
    const imageData = buffer.ctx.createImageData(width, height);
    const targetR = paletteIndex % 256;
    const targetG = Math.floor(paletteIndex / 256);
    const scaleX = controlBuffer.width / Math.max(1, control.width);
    const scaleY = controlBuffer.height / Math.max(1, control.height);

    for (let y = 0; y < height; y += 1) {
      const sampleY = clampInteger(Math.floor((bounds.y + y) * scaleY), 0, controlBuffer.height - 1);
      for (let x = 0; x < width; x += 1) {
        const sampleX = clampInteger(Math.floor((bounds.x + x) * scaleX), 0, controlBuffer.width - 1);
        const sourceOffset = (sampleY * controlBuffer.width + sampleX) * 4;
        if (
          controlBuffer.data[sourceOffset] !== targetR ||
          controlBuffer.data[sourceOffset + 1] !== targetG ||
          controlBuffer.data[sourceOffset + 3] <= 0
        ) {
          continue;
        }

        const targetOffset = (y * width + x) * 4;
        imageData.data[targetOffset] = 255;
        imageData.data[targetOffset + 1] = 255;
        imageData.data[targetOffset + 2] = 255;
        imageData.data[targetOffset + 3] = controlBuffer.data[sourceOffset + 3];
      }
    }

    buffer.ctx.putImageData(imageData, 0, 0);
    return buffer.canvas;
  }

  private buildTerrainControlMaskFromRaw(rawMask: HTMLCanvasElement, blur: number): HTMLCanvasElement {
    const mask = this.createCanvasBuffer(rawMask.width, rawMask.height, true);
    const radius = Math.max(0, Math.round(blur));
    if (radius <= 0) {
      mask.ctx.drawImage(rawMask, 0, 0);
      return mask.canvas;
    }

    mask.ctx.save();
    mask.ctx.filter = `blur(${radius}px)`;
    mask.ctx.drawImage(rawMask, 0, 0);
    mask.ctx.restore();
    return mask.canvas;
  }

  private applyHardTerrainControlCutouts(
    mask: HTMLCanvasElement,
    controlBuffer: ImageBuffer,
    control: StudioTerrainControlTexture,
    asset: TerrainAssetMetadata,
    layers: TerrainControlRenderLayer[],
    layer: TerrainControlRenderLayer,
    bounds: { x: number; y: number; width: number; height: number }
  ): void {
    const hardNeighborIds = resolveTransitionNeighborIds(
      asset,
      layer.terrainTextureId,
      (mode) => mode.type === "hard"
    );
    if (hardNeighborIds.length === 0) return;

    const ctx = mask.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    for (const neighborId of hardNeighborIds) {
      const neighbor = layers.find((candidate) => candidate.terrainTextureId === neighborId);
      if (!neighbor) continue;
      ctx.drawImage(this.buildTerrainControlRawMask(controlBuffer, control, neighbor.paletteIndex, bounds), 0, 0);
    }
    ctx.restore();
  }

  private fillTerrainPatternInBounds(
    ctx: CanvasRenderingContext2D,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    textureId: string,
    bounds: { x: number; y: number; width: number; height: number }
  ): boolean {
    const pattern = this.getPattern(ctx, data, image, textureId);
    if (!pattern) return false;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = pattern;
    ctx.translate(-bounds.x, -bounds.y);
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.restore();
    return true;
  }

  private drawTerrainLayerEffects(
    output: CanvasBuffer,
    control: StudioTerrainControlTexture,
    layers: TerrainControlRenderLayer[],
    bounds: { x: number; y: number; width: number; height: number }
  ): void {
    for (const layer of layers) {
      if (layer.mode.type !== "water" && !/water|eau|liquid|river|lake|sea|ocean|swamp|marais|lava/i.test(layer.terrainTextureId)) {
        continue;
      }

      const edge = this.createTerrainControlLayerEdgeMask(output, control, layer.paletteIndex, bounds, 6);
      if (!edge) continue;
      const gradient = output.ctx.createLinearGradient(0, 0, 0, output.canvas.height);
      gradient.addColorStop(0, "rgba(180, 235, 255, 0.18)");
      gradient.addColorStop(0.55, "rgba(89, 161, 185, 0.08)");
      gradient.addColorStop(1, "rgba(20, 48, 61, 0.22)");
      const overlay = this.createCanvasBuffer(output.canvas.width, output.canvas.height);
      overlay.ctx.fillStyle = gradient;
      overlay.ctx.fillRect(0, 0, overlay.canvas.width, overlay.canvas.height);
      overlay.ctx.save();
      overlay.ctx.globalCompositeOperation = "destination-in";
      overlay.ctx.drawImage(edge, 0, 0);
      overlay.ctx.restore();
      output.ctx.save();
      output.ctx.globalCompositeOperation = "screen";
      output.ctx.globalAlpha = 0.42;
      output.ctx.drawImage(overlay.canvas, 0, 0);
      output.ctx.restore();
    }
  }

  private createTerrainControlLayerEdgeMask(
    output: CanvasBuffer,
    control: StudioTerrainControlTexture,
    paletteIndex: number,
    bounds: { x: number; y: number; width: number; height: number },
    blur: number
  ): HTMLCanvasElement | null {
    if (output.canvas.width <= 0 || output.canvas.height <= 0) return null;
    const controlImage = this.loadedImages.get(control.source);
    if (!controlImage) return null;
    const controlBuffer = this.getImageBuffer(control.source, controlImage);
    if (!controlBuffer) return null;
    const rawMask = this.buildTerrainControlRawMask(controlBuffer, control, paletteIndex, bounds);
    const edge = this.createCanvasBuffer(rawMask.width, rawMask.height);
    edge.ctx.save();
    edge.ctx.filter = `blur(${Math.max(1, Math.round(blur))}px)`;
    edge.ctx.drawImage(rawMask, 0, 0);
    edge.ctx.restore();
    edge.ctx.save();
    edge.ctx.globalCompositeOperation = "destination-out";
    edge.ctx.drawImage(rawMask, 0, 0);
    edge.ctx.restore();
    return edge.canvas;
  }

  private drawHole(
    ctx: CanvasRenderingContext2D,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    feature: StudioTerrainMorphologyFeature
  ): void {
    const mask = this.buildTerrainMorphologyMask(data, feature);
    if (!mask) return;

    const smoothness = getTerrainMorphologySmoothness(feature);
    const topEdge = this.createTerrainMorphologyDirectionalEdgeMask(mask, "top", Math.round(13 - smoothness * 5));
    const bottomEdge = this.createTerrainMorphologyDirectionalEdgeMask(mask, "bottom", Math.round(11 - smoothness * 4));
    const leftEdge = this.createTerrainMorphologyDirectionalEdgeMask(mask, "left", Math.round(15 - smoothness * 5));
    const rightEdge = this.createTerrainMorphologyDirectionalEdgeMask(mask, "right", Math.round(15 - smoothness * 5));
    const faceMask = this.createTerrainMorphologyExtrudedFaceMask(topEdge, feature);
    this.clipTerrainMorphologyMask(faceMask, mask);
    const softFaceMask = this.createTerrainMorphologySoftMask(faceMask, smoothness > 0.6 ? 2 : 3, mask);
    const depth = getTerrainMorphologyHeight(feature);

    this.drawTerrainMorphologyMaskedColor(
      ctx,
      mask,
      "#070604",
      0.58 - smoothness * 0.12,
      "source-over",
      smoothness > 0.6 ? "blur(1px)" : "blur(2px)"
    );
    this.drawTerrainMorphologyMaskedColor(
      ctx,
      mask,
      "#020201",
      0.34 - smoothness * 0.08,
      "multiply",
      "blur(7px)",
      0,
      Math.round(depth * 0.28)
    );

    this.drawTerrainMorphologyTextureFill(ctx, softFaceMask, stringParam(feature.params.textureId), data, image, "#2d251f", 1);
    this.drawTerrainMorphologySideDepthShading(ctx, faceMask, leftEdge, rightEdge, feature, "recessed");
    this.drawTerrainMorphologyDepthBands(ctx, topEdge, feature);
    this.drawTerrainMorphologyMaskedColor(ctx, topEdge, "#080604", 0.58 - smoothness * 0.12, "multiply", "blur(1px)", 0, 3);
    this.drawTerrainMorphologyMaskedColor(ctx, bottomEdge, "#f4dfb1", 0.16 + smoothness * 0.04, "screen", "none", 0, -1);
    this.drawTerrainMorphologyMaskedColor(ctx, leftEdge, "#e7cca0", 0.13 - smoothness * 0.03, "screen", "blur(1px)", -2, 0);
    this.drawTerrainMorphologyMaskedColor(ctx, rightEdge, "#080604", 0.34 - smoothness * 0.08, "multiply", "blur(1px)", 3, 0);
    this.drawTerrainHoleFillMorphology(ctx, mask, feature, data, image);
  }

  private drawWall(
    ctx: CanvasRenderingContext2D,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    feature: StudioTerrainMorphologyFeature
  ): void {
    const parts = this.createTerrainWallRenderParts(data, feature);
    if (!parts) return;

    this.drawWallBase(ctx, data, image, feature, parts);
    this.drawWallForeground(ctx, data, image, feature, parts);
  }

  private drawWallBase(
    ctx: CanvasRenderingContext2D,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    feature: StudioTerrainMorphologyFeature,
    parts = this.createTerrainWallRenderParts(data, feature)
  ): void {
    if (!parts) return;
    this.drawTerrainMorphologyTextureFill(
      ctx,
      parts.mask,
      stringParam(feature.params.surfaceTextureId),
      data,
      image,
      "#050505",
      stringParam(feature.params.surfaceTextureId) ? 0.92 : 0
    );
  }

  private drawWallForeground(
    ctx: CanvasRenderingContext2D,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    feature: StudioTerrainMorphologyFeature,
    parts = this.createTerrainWallRenderParts(data, feature)
  ): void {
    if (!parts) return;
    this.drawTerrainMorphologyMaskedColor(
      ctx,
      parts.faceMask,
      "#17110d",
      0.38 - parts.smoothness * 0.08,
      "multiply",
      parts.smoothness > 0.6 ? "blur(4px)" : "blur(5px)",
      0,
      7
    );
    this.drawTerrainMorphologyTextureFill(ctx, parts.faceMask, stringParam(feature.params.textureId), data, image, "#7d6f58", 0.86);
    this.drawTerrainMorphologySideDepthShading(ctx, parts.faceMask, parts.leftEdge, parts.rightEdge, feature, "raised");
    this.drawTerrainMorphologyDepthBands(ctx, parts.bottomEdge, feature);
    this.drawTerrainMorphologyMaskedColor(ctx, parts.bottomEdge, "#090705", 0.48 - parts.smoothness * 0.12, "multiply", "blur(1px)", 0, 3);
    this.drawTerrainMorphologyMaskedColor(ctx, parts.leftEdge, "#f0dbad", 0.18 - parts.smoothness * 0.05, "screen", "blur(1px)", -3, 0);
    this.drawTerrainMorphologyMaskedColor(ctx, parts.rightEdge, "#100c09", 0.34 - parts.smoothness * 0.1, "multiply", "blur(1px)", 4, 0);
    this.drawTerrainMorphologyMaskedColor(ctx, parts.faceMask, "#0f0b08", 0.34 - parts.smoothness * 0.08, "multiply", "blur(2px)", 0, parts.height - 2);
    this.drawTerrainMorphologyElevationRiserLines(ctx, parts.topEdge, parts.faceMask, feature);
    this.drawTerrainMorphologyMaskedColor(ctx, parts.bottomEdge, "#f0dfb9", 0.11 + parts.smoothness * 0.05, "screen", "none", 0, -1);
    this.drawTerrainMorphologyMaskedColor(ctx, parts.bottomEdge, "#211812", 0.5 - parts.smoothness * 0.12, "multiply", "none", 0, 2);
    this.drawTerrainMorphologyMaskedColor(ctx, parts.bottomEdge, "#120d09", 0.58 - parts.smoothness * 0.12, "multiply", "none", 0, parts.height);
  }

  private createTerrainWallRenderParts(
    data: StudioTerrainRenderData,
    feature: StudioTerrainMorphologyFeature
  ): TerrainWallRenderParts | null {
    const mask = this.buildTerrainMorphologyMask(data, feature);
    if (!mask) return null;

    const smoothness = getTerrainMorphologySmoothness(feature);
    const height = getTerrainMorphologyHeight(feature);
    const topEdge = this.createTerrainMorphologyDirectionalEdgeMask(mask, "top", Math.round(12 - smoothness * 4));
    const bottomEdge = this.createTerrainMorphologyDirectionalEdgeMask(mask, "bottom", Math.round(13 - smoothness * 5));
    const faceMask = this.createTerrainMorphologyExtrudedFaceMask(bottomEdge, feature);
    const leftEdge = this.createTerrainMorphologyDirectionalEdgeMask(faceMask, "left", Math.round(16 - smoothness * 6));
    const rightEdge = this.createTerrainMorphologyDirectionalEdgeMask(faceMask, "right", Math.round(16 - smoothness * 6));

    return {
      mask,
      topEdge,
      bottomEdge,
      faceMask,
      leftEdge,
      rightEdge,
      smoothness,
      height,
    };
  }

  private createWallOcclusionSliceSprites(
    canvas: HTMLCanvasElement,
    mask: TerrainMorphologyMaskBuffer,
    feature: StudioTerrainMorphologyFeature,
    sliceWidth: number
  ): Sprite[] {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const maskCtx = mask.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !maskCtx) return [];

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const maskData = maskCtx.getImageData(0, 0, mask.canvas.width, mask.canvas.height).data;
    const sprites: Sprite[] = [];

    for (let sliceX = 0; sliceX < canvas.width; sliceX += sliceWidth) {
      const width = Math.min(sliceWidth, canvas.width - sliceX);
      const alphaBounds = findAlphaBounds(imageData, canvas.width, canvas.height, {
        x: sliceX,
        y: 0,
        width,
        height: canvas.height,
      });
      if (!alphaBounds) continue;

      const slice = this.createCanvasBuffer(alphaBounds.width, alphaBounds.height, true);
      slice.ctx.drawImage(
        canvas,
        alphaBounds.x,
        alphaBounds.y,
        alphaBounds.width,
        alphaBounds.height,
        0,
        0,
        alphaBounds.width,
        alphaBounds.height
      );

      const texture = Texture.from(slice.canvas);
      setNearestTextureScale(texture);
      const sprite = new Sprite(texture);
      sprite.x = Math.round(mask.bounds.x + alphaBounds.x);
      sprite.y = Math.round(mask.bounds.y + alphaBounds.y);
      sprite.zIndex = Math.round(mask.bounds.y + findSurfaceBottomY(maskData, mask.canvas.width, mask.canvas.height, sliceX, width) + 1);
      sprite.roundPixels = true;
      sprite.label = `StudioWallOcclusion:${feature.id}:${sliceX}`;
      sprites.push(sprite);
    }

    return sprites;
  }

  private buildTerrainMorphologyMask(
    data: StudioTerrainRenderData,
    feature: StudioTerrainMorphologyFeature
  ): TerrainMorphologyMaskBuffer | null {
    const bounds = getTerrainMorphologyBounds(data, feature, Math.max(40, getTerrainMorphologyHeight(feature) + 24));
    if (!bounds) return null;

    const mask = this.createCanvasBuffer(Math.max(1, Math.ceil(bounds.width)), Math.max(1, Math.ceil(bounds.height)), true);
    for (const stroke of feature.strokes) {
      this.drawStructuredTerrainMorphologyStrokeMask(mask.ctx, stroke, feature.params, bounds.x, bounds.y);
    }

    const result = { canvas: mask.canvas, bounds };
    return this.isTerrainMorphologyMaskEmpty(result) ? null : result;
  }

  private drawStructuredTerrainMorphologyStrokeMask(
    ctx: CanvasRenderingContext2D,
    stroke: StudioTerrainMorphologyFeature["strokes"][number],
    params: StudioTerrainMorphologyFeature["params"],
    offsetX: number,
    offsetY: number
  ): void {
    if (stroke.points.length === 0) return;

    const smoothness = getTerrainMorphologySmoothnessFromParams(params);
    const radius = Math.max(1, Number(stroke.radius) || 1);
    const spacing = Math.max(12, radius * (0.32 + smoothness * 0.14));

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#fff";

    const stamp = (x: number, y: number): void => {
      this.drawStructuredTerrainMorphologyStamp(ctx, x - offsetX, y - offsetY, radius, params);
    };

    for (let pointIndex = 0; pointIndex < stroke.points.length; pointIndex += 1) {
      const point = stroke.points[pointIndex];
      const previous = stroke.points[pointIndex - 1];

      if (!previous) {
        if (isTerrainMorphologyPointNearLocalBounds(point, radius, offsetX, offsetY, ctx.canvas.width, ctx.canvas.height)) {
          stamp(point.x, point.y);
        }
        continue;
      }

      if (!isTerrainMorphologySegmentNearLocalBounds(previous, point, radius, offsetX, offsetY, ctx.canvas.width, ctx.canvas.height)) {
        continue;
      }

      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / spacing));
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        stamp(previous.x + dx * t, previous.y + dy * t);
      }
    }

    ctx.restore();
  }

  private drawStructuredTerrainMorphologyStamp(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    params: StudioTerrainMorphologyFeature["params"]
  ): void {
    const smoothness = getTerrainMorphologySmoothnessFromParams(params);
    const roundness = clampNumber(Number(params.roundness), 0, 1);
    const roughness = (1 - smoothness) * 0.3;
    const points = Math.round(38 + smoothness * 34);
    const isHoleStamp = "depth" in params;
    const useStructuredStamp = !isHoleStamp && (smoothness > 0.62 || roundness < 0.28);
    const stampWidth = radius * (1.45 + roundness * 0.45);
    const stampHeight = radius * (1.18 + roundness * 0.72);
    const cornerRadius = Math.min(stampWidth, stampHeight) * 0.5 * roundness;

    if (useStructuredStamp) {
      drawTerrainMorphologyRoundRect(ctx, x - stampWidth * 0.5, y - stampHeight * 0.5, stampWidth, stampHeight, cornerRadius);
      ctx.fill();
      return;
    }

    drawTerrainMorphologyOrganicBlob(ctx, x, y, radius * (1 + roughness * 0.2), roughness, points);
    ctx.fill();
  }

  private drawTerrainMorphologyTextureFill(
    ctx: CanvasRenderingContext2D,
    mask: TerrainMorphologyMaskBuffer,
    terrainTextureId: string | undefined,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    fallbackColor: string,
    alpha = 1
  ): void {
    if (alpha <= 0) return;

    const fill = this.createCanvasBuffer(mask.canvas.width, mask.canvas.height);
    const isSolidBlack = terrainTextureId === SOLID_BLACK_TERRAIN_TEXTURE_ID;
    const pattern = !isSolidBlack && terrainTextureId
      ? this.getPattern(fill.ctx, data, image, terrainTextureId)
      : null;
    if (pattern) {
      fill.ctx.save();
      fill.ctx.imageSmoothingEnabled = false;
      fill.ctx.fillStyle = pattern;
      fill.ctx.translate(-mask.bounds.x, -mask.bounds.y);
      fill.ctx.fillRect(mask.bounds.x, mask.bounds.y, mask.bounds.width, mask.bounds.height);
      fill.ctx.restore();
    } else {
      fill.ctx.fillStyle = isSolidBlack ? "#050505" : fallbackColor;
      fill.ctx.fillRect(0, 0, mask.canvas.width, mask.canvas.height);
    }

    fill.ctx.save();
    fill.ctx.globalCompositeOperation = "destination-in";
    fill.ctx.drawImage(mask.canvas, 0, 0);
    fill.ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;
    ctx.drawImage(fill.canvas, mask.bounds.x, mask.bounds.y);
    ctx.restore();
  }

  private drawTerrainMorphologyMaskedColor(
    ctx: CanvasRenderingContext2D,
    mask: TerrainMorphologyMaskBuffer,
    color: string,
    alpha: number,
    operation: GlobalCompositeOperation,
    filter = "none",
    offsetX = 0,
    offsetY = 0,
    clipMask: TerrainMorphologyMaskBuffer = mask
  ): void {
    if (alpha <= 0) return;

    const overlay = this.createCanvasBuffer(mask.canvas.width, mask.canvas.height);
    overlay.ctx.save();
    overlay.ctx.filter = filter;
    overlay.ctx.drawImage(mask.canvas, offsetX, offsetY);
    overlay.ctx.restore();
    overlay.ctx.save();
    overlay.ctx.globalCompositeOperation = "source-in";
    overlay.ctx.fillStyle = color;
    overlay.ctx.fillRect(0, 0, mask.canvas.width, mask.canvas.height);
    overlay.ctx.restore();
    overlay.ctx.save();
    overlay.ctx.globalCompositeOperation = "destination-in";
    overlay.ctx.drawImage(clipMask.canvas, 0, 0);
    overlay.ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = operation;
    ctx.globalAlpha = alpha;
    ctx.drawImage(overlay.canvas, mask.bounds.x, mask.bounds.y);
    ctx.restore();
  }

  private drawTerrainMorphologyDepthBands(
    ctx: CanvasRenderingContext2D,
    edge: TerrainMorphologyMaskBuffer,
    feature: StudioTerrainMorphologyFeature
  ): void {
    const height = getTerrainMorphologyHeight(feature);
    const smoothness = getTerrainMorphologySmoothness(feature);
    const bandStep = Math.round(10 + smoothness * 5);

    for (let y = bandStep; y <= height; y += bandStep) {
      const depth = y / height;
      this.drawTerrainMorphologyMaskedColor(
        ctx,
        edge,
        "#15110d",
        0.11 - smoothness * 0.03 + depth * (0.16 - smoothness * 0.04),
        "multiply",
        smoothness > 0.6 ? "blur(2px)" : "blur(1px)",
        Math.round(Math.sin(y * 0.2) * (1 - smoothness) * 1.5),
        y
      );
    }
  }

  private drawTerrainMorphologySideDepthShading(
    ctx: CanvasRenderingContext2D,
    faceMask: TerrainMorphologyMaskBuffer,
    leftEdge: TerrainMorphologyMaskBuffer,
    rightEdge: TerrainMorphologyMaskBuffer,
    feature: StudioTerrainMorphologyFeature,
    mode: "raised" | "recessed"
  ): void {
    const height = getTerrainMorphologyHeight(feature);
    const smoothness = getTerrainMorphologySmoothness(feature);
    const step = Math.round(7 + smoothness * 5);
    const sideReach = Math.round(clampNumber(height * 0.045, 3, 8));
    const darkBase = mode === "raised" ? 0.12 : 0.16;
    const lightBase = mode === "raised" ? 0.08 : 0.1;

    for (let y = step; y <= height; y += step) {
      const depthRatio = y / height;
      const offsetY = mode === "raised" ? y : Math.round(y * 0.72);
      const sideOffset = Math.max(1, Math.round(sideReach * (0.55 + depthRatio * 0.45)));

      this.drawTerrainMorphologyMaskedColor(
        ctx,
        rightEdge,
        "#080604",
        darkBase + depthRatio * (0.18 - smoothness * 0.05),
        "multiply",
        smoothness > 0.62 ? "blur(2px)" : "blur(1px)",
        sideOffset,
        offsetY,
        faceMask
      );
      this.drawTerrainMorphologyMaskedColor(
        ctx,
        leftEdge,
        "#f4dfb4",
        lightBase + depthRatio * (0.08 - smoothness * 0.03),
        "screen",
        "blur(1px)",
        -Math.max(1, Math.round(sideOffset * 0.72)),
        offsetY,
        faceMask
      );
    }

    this.drawTerrainMorphologyMaskedColor(
      ctx,
      rightEdge,
      "#070504",
      mode === "raised" ? 0.32 - smoothness * 0.08 : 0.26 - smoothness * 0.06,
      "multiply",
      "blur(3px)",
      sideReach,
      Math.round(height * 0.48),
      faceMask
    );
  }

  private drawTerrainMorphologyElevationRiserLines(
    ctx: CanvasRenderingContext2D,
    topEdge: TerrainMorphologyMaskBuffer,
    faceMask: TerrainMorphologyMaskBuffer,
    feature: StudioTerrainMorphologyFeature
  ): void {
    const height = getTerrainMorphologyHeight(feature);
    const smoothness = getTerrainMorphologySmoothness(feature);

    this.drawTerrainMorphologyMaskedColor(ctx, topEdge, "#fff3c6", 0.34 - smoothness * 0.06, "screen", "blur(1px)", 0, -1);
    this.drawTerrainMorphologyMaskedColor(ctx, topEdge, "#120d09", 0.24 - smoothness * 0.05, "multiply", "blur(1px)", 0, 2, faceMask);
    this.drawTerrainMorphologyMaskedColor(ctx, topEdge, "#1b130d", 0.13 - smoothness * 0.03, "multiply", "blur(2px)", 0, Math.round(height * 0.45), faceMask);
  }

  private drawTerrainHoleFillMorphology(
    ctx: CanvasRenderingContext2D,
    mask: TerrainMorphologyMaskBuffer,
    feature: StudioTerrainMorphologyFeature,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null
  ): void {
    const level = clampNumber(Number(feature.params.fillHeight ?? 0) / 100, 0, 1);
    if (level <= 0) return;

    const bounds = getTerrainMorphologyLocalMaskBounds(mask);
    if (!bounds) return;

    const width = bounds.maxX - bounds.minX + 1;
    const height = bounds.maxY - bounds.minY + 1;
    const minDimension = Math.min(width, height);
    const depth = getTerrainMorphologyHeight(feature);
    const dropY = Math.round((1 - level) * depth * 0.78);
    const wallMargin = Math.round(clampNumber(minDimension * 0.035, 4, 10));
    const inset = Math.round(wallMargin + minDimension * 0.05 * (1 - level));
    const fillMask = this.createTerrainMorphologyProjectedLevelMask(mask, inset, dropY);
    const softFillMask = this.createTerrainMorphologySoftMask(fillMask, 7, mask);

    this.drawTerrainMorphologyTextureFill(
      ctx,
      softFillMask,
      stringParam(feature.params.fillTextureId),
      data,
      image,
      stringParam(feature.params.fillColor) ?? "rgba(60, 128, 151, 0.88)",
      0.86
    );

    const levelLine = this.createTerrainMorphologyLevelLineMask(mask, fillMask);
    this.drawTerrainMorphologyMaskedColor(ctx, levelLine, "#f5f0d8", 0.42, "screen", "blur(1px)");
  }

  private createTerrainMorphologyDirectionalEdgeMask(
    source: TerrainMorphologyMaskBuffer,
    edge: "bottom" | "left" | "right" | "top",
    distance: number
  ): TerrainMorphologyMaskBuffer {
    const target = this.createCanvasBuffer(source.canvas.width, source.canvas.height);
    const edgeDistance = Math.max(1, Math.round(distance));
    const offset = {
      bottom: { x: 0, y: -edgeDistance },
      left: { x: edgeDistance, y: 0 },
      right: { x: -edgeDistance, y: 0 },
      top: { x: 0, y: edgeDistance },
    } satisfies Record<"bottom" | "left" | "right" | "top", { x: number; y: number }>;

    target.ctx.drawImage(source.canvas, 0, 0);
    target.ctx.save();
    target.ctx.globalCompositeOperation = "destination-out";
    target.ctx.drawImage(source.canvas, offset[edge].x, offset[edge].y);
    target.ctx.restore();
    return { canvas: target.canvas, bounds: source.bounds };
  }

  private createTerrainMorphologyExtrudedFaceMask(
    source: TerrainMorphologyMaskBuffer,
    feature: StudioTerrainMorphologyFeature
  ): TerrainMorphologyMaskBuffer {
    const target = this.createCanvasBuffer(source.canvas.width, source.canvas.height);
    const height = getTerrainMorphologyHeight(feature);
    const smoothness = getTerrainMorphologySmoothness(feature);
    const step = Math.round(4 + smoothness * 2);

    for (let y = 0; y <= height; y += step) {
      const sway = Math.round(Math.sin(y * 0.18) * (1 - smoothness) * 2);
      target.ctx.drawImage(source.canvas, sway, y);
    }

    return { canvas: target.canvas, bounds: source.bounds };
  }

  private createTerrainMorphologySoftMask(
    source: TerrainMorphologyMaskBuffer,
    blur: number,
    clipMask: TerrainMorphologyMaskBuffer = source
  ): TerrainMorphologyMaskBuffer {
    const target = this.createCanvasBuffer(source.canvas.width, source.canvas.height);
    target.ctx.save();
    target.ctx.filter = `blur(${Math.max(1, Math.round(blur))}px)`;
    target.ctx.drawImage(source.canvas, 0, 0);
    target.ctx.restore();
    const result = { canvas: target.canvas, bounds: source.bounds };
    this.clipTerrainMorphologyMask(result, clipMask);
    return result;
  }

  private createTerrainMorphologyProjectedLevelMask(
    source: TerrainMorphologyMaskBuffer,
    inset: number,
    dropY: number
  ): TerrainMorphologyMaskBuffer {
    const target = this.createCanvasBuffer(source.canvas.width, source.canvas.height);
    target.ctx.drawImage(source.canvas, 0, dropY);
    target.ctx.save();
    target.ctx.globalCompositeOperation = "destination-in";
    target.ctx.drawImage(source.canvas, 0, 0);
    target.ctx.restore();

    if (inset > 0.5) {
      const rings = [inset * 0.48, inset];
      target.ctx.save();
      target.ctx.globalCompositeOperation = "destination-in";
      for (const distance of rings) {
        const samples = Math.round(clampNumber(8 + distance * 0.18, 10, 18));
        for (let index = 0; index < samples; index += 1) {
          const angle = (index / samples) * Math.PI * 2;
          target.ctx.drawImage(
            source.canvas,
            Math.round(Math.cos(angle) * distance),
            dropY + Math.round(Math.sin(angle) * distance)
          );
        }
      }
      target.ctx.restore();
    }

    return { canvas: target.canvas, bounds: source.bounds };
  }

  private createTerrainMorphologyLevelLineMask(
    mask: TerrainMorphologyMaskBuffer,
    levelMask: TerrainMorphologyMaskBuffer
  ): TerrainMorphologyMaskBuffer {
    const target = this.createCanvasBuffer(mask.canvas.width, mask.canvas.height);
    target.ctx.save();
    target.ctx.filter = "blur(3px)";
    target.ctx.drawImage(levelMask.canvas, 0, 0);
    target.ctx.restore();
    target.ctx.save();
    target.ctx.globalCompositeOperation = "destination-out";
    target.ctx.drawImage(levelMask.canvas, 0, 0);
    target.ctx.restore();
    const result = { canvas: target.canvas, bounds: mask.bounds };
    this.clipTerrainMorphologyMask(result, mask);
    return result;
  }

  private clipTerrainMorphologyMask(
    target: TerrainMorphologyMaskBuffer,
    clipMask: TerrainMorphologyMaskBuffer
  ): void {
    const targetContext = target.canvas.getContext("2d");
    if (!targetContext) return;
    targetContext.save();
    targetContext.globalCompositeOperation = "destination-in";
    targetContext.drawImage(clipMask.canvas, 0, 0);
    targetContext.restore();
  }

  private isTerrainMorphologyMaskEmpty(mask: TerrainMorphologyMaskBuffer): boolean {
    const context = mask.canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return true;
    const data = context.getImageData(0, 0, mask.canvas.width, mask.canvas.height).data;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) return false;
    }
    return true;
  }

  private fillTerrainRect(
    ctx: CanvasRenderingContext2D,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    textureId: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const pattern = this.getPattern(ctx, data, image, textureId);
    if (pattern) {
      ctx.save();
      ctx.fillStyle = pattern;
      ctx.fillRect(x, y, width, height);
      ctx.restore();
      return;
    }
    ctx.fillStyle = fallbackTerrainColor(textureId);
    ctx.fillRect(x, y, width, height);
  }

  private strokeWithTerrainTexture(
    ctx: CanvasRenderingContext2D,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    textureId: string,
    radius: number
  ): void {
    const pattern = this.getPattern(ctx, data, image, textureId, Math.max(16, radius));
    if (pattern) {
      ctx.strokeStyle = pattern;
      ctx.stroke();
      return;
    }
    ctx.strokeStyle = fallbackTerrainColor(textureId);
    ctx.stroke();
  }

  private getPattern(
    ctx: CanvasRenderingContext2D,
    data: StudioTerrainRenderData,
    image: HTMLImageElement | null,
    textureId: string,
    sizeOverride?: number
  ): CanvasPattern | null {
    if (!data.asset || !image) return null;
    const texture = findTerrainTexture(data.asset, textureId);
    if (!texture) return null;
    const renderSize = Math.max(1, Math.round(sizeOverride ?? texture.renderTileSize ?? data.tileSize));
    const cacheKey = `${data.sourceTexture}:${texture.id}:${renderSize}`;
    let patternCanvas = this.patternCache.get(cacheKey);
    if (!patternCanvas) {
      const source = resolveTerrainTextureSourceRect(data.asset, texture, image.naturalWidth, image.naturalHeight);
      patternCanvas = createMirroredTerrainPatternCanvas(image, source, renderSize);
      this.patternCache.set(cacheKey, patternCanvas);
    }
    return ctx.createPattern(patternCanvas, "repeat");
  }

  private drawFadeEdge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tileSize: number,
    fadeWidth: number,
    edge: "top" | "right" | "bottom" | "left"
  ): void {
    ctx.save();
    let gradient: CanvasGradient;
    if (edge === "top") {
      gradient = ctx.createLinearGradient(0, y, 0, y + fadeWidth);
      gradient.addColorStop(0, "rgba(255,255,255,0.18)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, tileSize, fadeWidth);
    } else if (edge === "bottom") {
      gradient = ctx.createLinearGradient(0, y + tileSize, 0, y + tileSize - fadeWidth);
      gradient.addColorStop(0, "rgba(255,255,255,0.18)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y + tileSize - fadeWidth, tileSize, fadeWidth);
    } else if (edge === "left") {
      gradient = ctx.createLinearGradient(x, 0, x + fadeWidth, 0);
      gradient.addColorStop(0, "rgba(255,255,255,0.18)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, fadeWidth, tileSize);
    } else {
      gradient = ctx.createLinearGradient(x + tileSize, 0, x + tileSize - fadeWidth, 0);
      gradient.addColorStop(0, "rgba(255,255,255,0.18)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x + tileSize - fadeWidth, y, fadeWidth, tileSize);
    }
    ctx.globalCompositeOperation = "soft-light";
    ctx.restore();
  }

  private drawDebugCollisions(
    ctx: CanvasRenderingContext2D,
    collisions: StudioCollisionPolygon[],
    bounds: { x: number; y: number; width: number; height: number }
  ): void {
    if (collisions.length === 0) return;
    ctx.save();
    ctx.lineWidth = 2;
    collisions.forEach((polygon) => {
      if (!rectsIntersect(bounds, polygon)) return;
      ctx.beginPath();
      polygon.points.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(239, 68, 68, 0.18)";
      ctx.strokeStyle = "rgba(239, 68, 68, 0.72)";
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  private createCanvasBuffer(width: number, height: number, willReadFrequently = false): CanvasBuffer {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = Math.max(1, Math.ceil(height));
    const ctx = canvas.getContext("2d", willReadFrequently ? { willReadFrequently: true } : undefined);
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  }

  private loadImage(source: string): Promise<HTMLImageElement | null> {
    if (!source || typeof Image === "undefined") return Promise.resolve(null);
    if (!this.imageCache.has(source)) {
      this.imageCache.set(
        source,
        new Promise((resolve) => {
          const image = new Image();
          image.crossOrigin = "anonymous";
          image.onload = () => {
            this.loadedImages.set(source, image);
            resolve(image);
          };
          image.onerror = () => resolve(null);
          image.src = source;
          if (image.complete && image.naturalWidth > 0) {
            this.loadedImages.set(source, image);
            resolve(image);
          }
        })
      );
    }
    return this.imageCache.get(source)!;
  }

  private getImageBuffer(source: string, image: HTMLImageElement): ImageBuffer | null {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width <= 0 || height <= 0) return null;
    const key = `${source}:${width}x${height}`;
    const cached = this.imageBufferCache.get(key);
    if (cached) return cached;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0, width, height);
      const data = ctx.getImageData(0, 0, width, height).data;
      const buffer = { key, width, height, data };
      this.imageBufferCache.set(key, buffer);
      return buffer;
    } catch {
      return null;
    }
  }
}

export class StudioTerrainWallOcclusionRenderer {
  private readonly renderer = new StudioTerrainChunkRenderer(new PixiContainer());
  private sprites: Sprite[] = [];
  private renderVersion = "";

  async renderMap(map: any): Promise<Sprite[]> {
    const data = isStudioTerrainRenderData(map?.terrainRenderData)
      ? map.terrainRenderData
      : createStudioTerrainRenderData(map);
    const version = `${data.version}|wall-occlusion:v1`;
    if (version === this.renderVersion) {
      return this.sprites;
    }

    const nextSprites = await this.renderer.createWallOcclusionSprites(map);
    this.clearSprites();
    this.sprites = nextSprites;
    this.renderVersion = version;
    return this.sprites;
  }

  destroy(): void {
    this.clearSprites();
    this.renderer.destroy();
  }

  private clearSprites(): void {
    for (const sprite of this.sprites) {
      if (!sprite.destroyed) {
        sprite.destroy({ texture: true });
      }
    }
    this.sprites = [];
    this.renderVersion = "";
  }
}

function createTerrainControlRenderLayers(
  asset: TerrainAssetMetadata,
  palette: string[]
): TerrainControlRenderLayer[] {
  return palette
    .map((terrainTextureId, paletteIndex): TerrainControlRenderLayer | null => {
      const texture = findTerrainTexture(asset, terrainTextureId) ?? findTerrainTexture(asset, paletteIndex);
      if (!texture) return null;
      const mode = getTerrainRenderMode(texture);
      return {
        terrainTextureId,
        paletteIndex,
        priority: resolveTerrainLayerPriority(texture, paletteIndex),
        blendRadius: resolveTerrainLayerBlendRadius(asset, terrainTextureId, mode),
        mode,
      };
    })
    .filter((layer): layer is TerrainControlRenderLayer => layer !== null)
    .sort((left, right) => left.priority - right.priority || left.paletteIndex - right.paletteIndex);
}

function resolveTerrainLayerPriority(texture: ReturnType<typeof findTerrainTexture>, paletteIndex: number): number {
  const priority = Number((texture as { priority?: unknown } | null | undefined)?.priority);
  return Number.isFinite(priority) ? priority : paletteIndex;
}

function resolveTerrainLayerBlendRadius(
  asset: TerrainAssetMetadata,
  terrainTextureId: string,
  mode: TerrainRenderMode
): number {
  const transitionRadii = resolveTerrainTransitionRules(asset, terrainTextureId).map((transition) =>
    resolveTerrainModeBlendRadius(transition.mode)
  );
  return Math.max(resolveTerrainModeBlendRadius(mode), ...transitionRadii);
}

function resolveTerrainModeBlendRadius(mode: TerrainRenderMode): number {
  if (mode.type === "hard") return 0;
  if (mode.type === "fade") {
    const width = Number(mode.width);
    return Number.isFinite(width) && width > 0 ? width : 18;
  }
  if (mode.type === "water") return mode.border === false ? 8 : 16;
  if (mode.type === "custom") {
    const width = Number(mode.params?.blendRadius ?? mode.params?.width);
    return Number.isFinite(width) && width >= 0 ? width : 18;
  }
  return 18;
}

function resolveTerrainTransitionRules(
  asset: TerrainAssetMetadata,
  terrainTextureId: string
): Array<{ from: string; to: string; mode: TerrainRenderMode; priority?: number }> {
  return asset.transitions
    .filter((transition) => transition.from === terrainTextureId || transition.to === terrainTextureId)
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
}

function resolveTransitionNeighborIds(
  asset: TerrainAssetMetadata,
  terrainTextureId: string,
  predicate: (mode: TerrainRenderMode) => boolean
): string[] {
  return resolveTerrainTransitionRules(asset, terrainTextureId)
    .filter((transition) => predicate(transition.mode))
    .map((transition) => (transition.from === terrainTextureId ? transition.to : transition.from))
    .filter((neighborId, index, all) => all.indexOf(neighborId) === index);
}

function composeTerrainLayerPixels(
  width: number,
  height: number,
  layers: TerrainCompositeLayer[]
): Uint8ClampedArray {
  const pixelCount = Math.max(0, Math.floor(width) * Math.floor(height));
  const output = new Uint8ClampedArray(pixelCount * 4);

  for (let offset = 0; offset < output.length; offset += 4) {
    let maskTotal = 0;
    let alphaTotal = 0;
    let red = 0;
    let green = 0;
    let blue = 0;

    for (const layer of layers) {
      const maskAlpha = layer.mask[offset + 3] / 255;
      if (maskAlpha <= 0) continue;

      const pixelAlpha = layer.pixels[offset + 3] / 255;
      const alphaWeight = maskAlpha * pixelAlpha;
      maskTotal += maskAlpha;
      if (alphaWeight <= 0) continue;

      alphaTotal += alphaWeight;
      red += layer.pixels[offset] * alphaWeight;
      green += layer.pixels[offset + 1] * alphaWeight;
      blue += layer.pixels[offset + 2] * alphaWeight;
    }

    if (maskTotal <= 0 || alphaTotal <= 0) continue;

    output[offset] = clampByte(red / alphaTotal);
    output[offset + 1] = clampByte(green / alphaTotal);
    output[offset + 2] = clampByte(blue / alphaTotal);
    output[offset + 3] = clampByte((alphaTotal / maskTotal) * 255);
  }

  return output;
}

function intersectBounds(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } | null {
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function getTerrainMorphologyHeight(feature: StudioTerrainMorphologyFeature): number {
  if (feature.kind === "hole") {
    return clampNumber(Number(feature.params.depth) || 58, 12, 160);
  }
  return clampNumber(Number(feature.params.height) || 56, 12, 160);
}

function getTerrainMorphologySmoothness(feature: StudioTerrainMorphologyFeature): number {
  return getTerrainMorphologySmoothnessFromParams(feature.params);
}

function getTerrainMorphologySmoothnessFromParams(params: StudioTerrainMorphologyFeature["params"]): number {
  return clampNumber(1 - Number(params.roughness ?? 0), 0, 1);
}

function getTerrainMorphologyBounds(
  data: StudioTerrainRenderData,
  feature: StudioTerrainMorphologyFeature,
  padding = 0
): { x: number; y: number; width: number; height: number } | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const stroke of feature.strokes) {
    const radius = Math.max(1, Number(stroke.radius) || 1);
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - radius);
      minY = Math.min(minY, point.y - radius);
      maxX = Math.max(maxX, point.x + radius);
      maxY = Math.max(maxY, point.y + radius);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  const x = Math.max(0, Math.min(data.width, Math.floor(minX - padding)));
  const y = Math.max(0, Math.min(data.height, Math.floor(minY - padding)));
  const right = Math.max(x, Math.min(data.width, Math.ceil(maxX + padding)));
  const bottom = Math.max(y, Math.min(data.height, Math.ceil(maxY + padding)));
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function isTerrainMorphologyPointNearLocalBounds(
  point: { x: number; y: number },
  radius: number,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number
): boolean {
  return (
    point.x + radius >= offsetX &&
    point.y + radius >= offsetY &&
    point.x - radius <= offsetX + width &&
    point.y - radius <= offsetY + height
  );
}

function isTerrainMorphologySegmentNearLocalBounds(
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number
): boolean {
  return (
    Math.max(from.x, to.x) + radius >= offsetX &&
    Math.max(from.y, to.y) + radius >= offsetY &&
    Math.min(from.x, to.x) - radius <= offsetX + width &&
    Math.min(from.y, to.y) - radius <= offsetY + height
  );
}

function drawTerrainMorphologyOrganicBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  roughness: number,
  points: number
): void {
  const shape: Array<{ x: number; y: number }> = [];
  const seed = x * 0.017 + y * 0.011 + radius * 0.029;

  for (let index = 0; index < points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const coarse = terrainMorphologyNoise(Math.cos(angle) * 1.8 + seed, Math.sin(angle) * 1.8 - seed, 31);
    const fine = terrainMorphologyNoise(Math.cos(angle) * 4.5 - seed, Math.sin(angle) * 4.5 + seed, 37);
    const variation = (coarse - 0.5) * roughness + (fine - 0.5) * roughness * 0.42;
    const localRadius = radius * (1 + variation);
    shape.push({
      x: x + Math.cos(angle) * localRadius,
      y: y + Math.sin(angle) * localRadius,
    });
  }

  ctx.beginPath();
  for (let index = 0; index < shape.length; index += 1) {
    const current = shape[index];
    const next = shape[(index + 1) % shape.length];
    const midX = (current.x + next.x) * 0.5;
    const midY = (current.y + next.y) * 0.5;
    if (index === 0) {
      ctx.moveTo(midX, midY);
    } else {
      ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }
  }
  ctx.closePath();
}

function drawTerrainMorphologyRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const roundRect = (ctx as CanvasRenderingContext2D & { roundRect?: CanvasRenderingContext2D["roundRect"] }).roundRect;
  if (roundRect) {
    ctx.beginPath();
    roundRect.call(ctx, x, y, width, height, radius);
    return;
  }

  const clampedRadius = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + clampedRadius, y);
  ctx.lineTo(x + width - clampedRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  ctx.lineTo(x + width, y + height - clampedRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
  ctx.lineTo(x + clampedRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  ctx.lineTo(x, y + clampedRadius);
  ctx.quadraticCurveTo(x, y, x + clampedRadius, y);
  ctx.closePath();
}

function getTerrainMorphologyLocalMaskBounds(
  mask: TerrainMorphologyMaskBuffer
): { maxX: number; maxY: number; minX: number; minY: number } | null {
  const data = mask.canvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, mask.canvas.width, mask.canvas.height).data;
  if (!data) return null;

  let minX = mask.canvas.width;
  let minY = mask.canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < mask.canvas.height; y += 1) {
    for (let x = 0; x < mask.canvas.width; x += 1) {
      const alpha = data[(y * mask.canvas.width + x) * 4 + 3];
      if (alpha === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX < 0 || maxY < 0 ? null : { maxX, maxY, minX, minY };
}

function terrainMorphologyNoise(x: number, y: number, seed = 0): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function createTerrainControlLayers(
  asset: TerrainAssetMetadata,
  palette: string[],
  imageWidth: number,
  imageHeight: number
): TerrainControlLayer[] {
  return palette
    .map((terrainTextureId, paletteIndex): TerrainControlLayer | null => {
      const texture = findTerrainTexture(asset, terrainTextureId) ??
        findTerrainTexture(asset, paletteIndex);
      if (!texture) return null;
      const source = resolveTerrainTextureSourceRect(asset, texture, imageWidth, imageHeight);
      return {
        terrainTextureId,
        paletteIndex,
        source,
      };
    })
    .filter((layer): layer is TerrainControlLayer => layer !== null);
}

function sampleTerrainControlColor(
  sourceBuffer: ImageBuffer,
  controlBuffer: ImageBuffer,
  control: StudioTerrainControlTexture,
  layers: TerrainControlLayer[],
  sourceTileSize: number,
  transitionWidth: number,
  worldX: number,
  worldY: number
): RgbaColor {
  const current = readTerrainControlPixel(controlBuffer, control, layers, worldX, worldY);
  if (!current) return TRANSPARENT;

  const baseColor = sampleTerrainLayerColor(
    sourceBuffer,
    current.layer,
    sourceTileSize,
    worldX,
    worldY,
    current.light
  );
  let r = baseColor.r;
  let g = baseColor.g;
  let b = baseColor.b;
  let outputAlpha = current.coverage;
  const searchWidth = Math.max(transitionWidth, current.coverage < 0.999 ? 12 : 0);

  if (
    searchWidth > 0 &&
    shouldSearchTerrainTransition(
      controlBuffer,
      control,
      layers,
      current.layer.paletteIndex,
      searchWidth,
      worldX,
      worldY,
      current.coverage
    )
  ) {
    let neighborR = 0;
    let neighborG = 0;
    let neighborB = 0;
    let neighborWeight = 0;
    let priorityNeighborR = 0;
    let priorityNeighborG = 0;
    let priorityNeighborB = 0;
    let priorityNeighborWeight = 0;
    let nearestPriorityDistance = searchWidth + 1;
    let softBoundary = 0;

    for (let stepIndex = 1; stepIndex <= 8; stepIndex += 1) {
      const distance = Math.max(1, searchWidth * (stepIndex / 8));
      const proximity = 1 - clampNumber(distance / Math.max(searchWidth, 1), 0, 1);

      for (let dir = 0; dir < TERRAIN_TRANSITION_DIRECTIONS.length; dir += 1) {
        const direction = TERRAIN_TRANSITION_DIRECTIONS[dir];
        const neighbor = readTerrainControlPixel(
          controlBuffer,
          control,
          layers,
          worldX + direction.x * distance,
          worldY + direction.y * distance
        );
        if (!neighbor) continue;

        const diagonalPenalty = dir >= 4 ? 0.72 : 1;
        const weight = (0.08 + proximity * proximity) * diagonalPenalty;
        if (neighbor.layer.paletteIndex === current.layer.paletteIndex) {
          if (neighbor.coverage < 0.999) {
            softBoundary = Math.max(softBoundary, proximity);
          }
          continue;
        }

        const neighborColor = sampleTerrainLayerColor(
          sourceBuffer,
          neighbor.layer,
          sourceTileSize,
          worldX,
          worldY,
          current.light
        );
        neighborR += neighborColor.r * weight;
        neighborG += neighborColor.g * weight;
        neighborB += neighborColor.b * weight;
        neighborWeight += weight;

        if (neighbor.layer.paletteIndex < current.layer.paletteIndex) {
          priorityNeighborR += neighborColor.r * weight;
          priorityNeighborG += neighborColor.g * weight;
          priorityNeighborB += neighborColor.b * weight;
          priorityNeighborWeight += weight;
          nearestPriorityDistance = Math.min(nearestPriorityDistance, distance);
        }
      }
    }

    if (current.coverage < 0.999 && neighborWeight > 0) {
      const brushCoverage = smoothstep(0, 1, current.coverage);
      r = mix(neighborR / neighborWeight, baseColor.r, brushCoverage);
      g = mix(neighborG / neighborWeight, baseColor.g, brushCoverage);
      b = mix(neighborB / neighborWeight, baseColor.b, brushCoverage);
      outputAlpha = 1;
    } else if (transitionWidth > 0 && priorityNeighborWeight > 0 && nearestPriorityDistance <= searchWidth) {
      const edge = 1 - smoothstep(0, searchWidth, nearestPriorityDistance);
      const softBoundarySuppression = 1 - smoothstep(0, 0.95, softBoundary);
      const blendAmount = clampNumber(Math.pow(edge, 0.7) * 0.52 * softBoundarySuppression, 0, 0.52);
      r = mix(baseColor.r, priorityNeighborR / priorityNeighborWeight, blendAmount);
      g = mix(baseColor.g, priorityNeighborG / priorityNeighborWeight, blendAmount);
      b = mix(baseColor.b, priorityNeighborB / priorityNeighborWeight, blendAmount);
    }
  }

  return {
    r: clampByte(r),
    g: clampByte(g),
    b: clampByte(b),
    a: clampByte(baseColor.a * outputAlpha),
  };
}

function shouldSearchTerrainTransition(
  controlBuffer: ImageBuffer,
  control: StudioTerrainControlTexture,
  layers: TerrainControlLayer[],
  paletteIndex: number,
  searchWidth: number,
  worldX: number,
  worldY: number,
  coverage: number
): boolean {
  if (coverage < 0.999) return true;
  const probeDistance = Math.max(1, searchWidth);
  for (const direction of TERRAIN_TRANSITION_DIRECTIONS) {
    const neighbor = readTerrainControlPixel(
      controlBuffer,
      control,
      layers,
      worldX + direction.x * probeDistance,
      worldY + direction.y * probeDistance
    );
    if (!neighbor || neighbor.layer.paletteIndex !== paletteIndex || neighbor.coverage < 0.999) {
      return true;
    }
  }
  return false;
}

function readTerrainControlPixel(
  controlBuffer: ImageBuffer,
  control: StudioTerrainControlTexture,
  layers: TerrainControlLayer[],
  worldX: number,
  worldY: number
): { layer: TerrainControlLayer; light: number; coverage: number } | null {
  if (worldX < 0 || worldY < 0 || worldX >= control.width || worldY >= control.height) {
    return null;
  }
  const x = clampInteger(Math.floor(worldX * (controlBuffer.width / control.width)), 0, controlBuffer.width - 1);
  const y = clampInteger(Math.floor(worldY * (controlBuffer.height / control.height)), 0, controlBuffer.height - 1);
  const offset = (y * controlBuffer.width + x) * 4;
  const coverage = controlBuffer.data[offset + 3] / 255;
  if (coverage <= 0) return null;
  const paletteIndex = controlBuffer.data[offset] + controlBuffer.data[offset + 1] * 256;
  const layer = layers.find((candidate) => candidate.paletteIndex === paletteIndex);
  if (!layer) return null;
  return {
    layer,
    light: controlBuffer.data[offset + 2] / 128,
    coverage,
  };
}

function sampleTerrainLayerColor(
  sourceBuffer: ImageBuffer,
  layer: TerrainControlLayer,
  sourceTileSize: number,
  worldX: number,
  worldY: number,
  light: number
): RgbaColor {
  const localX = mirroredLocal(worldX, Math.max(sourceTileSize * 2, 1));
  const localY = mirroredLocal(worldY, Math.max(sourceTileSize * 2, 1));
  const x = clampInteger(
    Math.floor(layer.source.x + localX * Math.max(1, layer.source.width - 1)),
    0,
    sourceBuffer.width - 1
  );
  const y = clampInteger(
    Math.floor(layer.source.y + localY * Math.max(1, layer.source.height - 1)),
    0,
    sourceBuffer.height - 1
  );
  const offset = (y * sourceBuffer.width + x) * 4;
  return {
    r: sourceBuffer.data[offset] * light,
    g: sourceBuffer.data[offset + 1] * light,
    b: sourceBuffer.data[offset + 2] * light,
    a: sourceBuffer.data[offset + 3],
  };
}

function resolveTerrainTransitionWidth(asset: TerrainAssetMetadata): number {
  const fadeWidths = asset.transitions
    .map((transition) => terrainRenderModeWidth(transition.mode))
    .filter((width) => width > 0);
  if (fadeWidths.length > 0) return Math.max(...fadeWidths);

  const textureWidths = asset.terrainTextures
    .map((texture) => terrainRenderModeWidth(texture.defaultRenderMode))
    .filter((width) => width > 0);
  return textureWidths.length > 0 ? Math.max(...textureWidths) : 18;
}

function terrainRenderModeWidth(mode: TerrainRenderMode | undefined): number {
  if (!mode) return 0;
  if (mode.type === "fade") {
    const width = Number(mode.width);
    return Number.isFinite(width) && width > 0 ? width : 18;
  }
  if (mode.type === "water") return mode.border === false ? 8 : 16;
  if (mode.type === "custom") {
    const width = Number(mode.params?.blendRadius ?? mode.params?.width);
    return Number.isFinite(width) && width > 0 ? width : 18;
  }
  return 0;
}

function mirroredLocal(world: number, period: number): number {
  const local = positiveModulo(world / period, 1);
  return 1 - Math.abs(local * 2 - 1);
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clampNumber((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clampByte(value: number): number {
  return clampInteger(Math.round(value), 0, 255);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function findAlphaBounds(
  data: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  bounds: { x: number; y: number; width: number; height: number },
  threshold = 4
): { x: number; y: number; width: number; height: number } | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const startX = clampInteger(Math.floor(bounds.x), 0, canvasWidth - 1);
  const startY = clampInteger(Math.floor(bounds.y), 0, canvasHeight - 1);
  const endX = clampInteger(Math.ceil(bounds.x + bounds.width), startX + 1, canvasWidth);
  const endY = clampInteger(Math.ceil(bounds.y + bounds.height), startY + 1, canvasHeight);

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const alpha = data[(y * canvasWidth + x) * 4 + 3];
      if (alpha <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function findSurfaceBottomY(
  maskData: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  sliceX: number,
  sliceWidth: number
): number {
  const startX = clampInteger(sliceX, 0, canvasWidth - 1);
  const endX = clampInteger(sliceX + sliceWidth, startX + 1, canvasWidth);
  let bottomY = 0;

  for (let x = startX; x < endX; x += 1) {
    for (let y = canvasHeight - 1; y >= 0; y -= 1) {
      if (maskData[(y * canvasWidth + x) * 4 + 3] > 8) {
        bottomY = Math.max(bottomY, y);
        break;
      }
    }
  }

  return bottomY;
}

const TRANSPARENT: RgbaColor = { r: 0, g: 0, b: 0, a: 0 };

const TERRAIN_TRANSITION_DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 0.70710678, y: 0.70710678 },
  { x: -0.70710678, y: 0.70710678 },
  { x: 0.70710678, y: -0.70710678 },
  { x: -0.70710678, y: -0.70710678 },
] as const;

function drawStrokePath(ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>): void {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
}

function featureIntersectsBounds(
  feature: StudioTerrainMorphologyFeature,
  bounds: { x: number; y: number; width: number; height: number }
): boolean {
  const margin =
    Math.max(...feature.strokes.map((stroke) => stroke.radius), STUDIO_TERRAIN_TILE_SIZE) * 2 +
    getTerrainMorphologyHeight(feature) +
    32;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  feature.strokes.forEach((stroke) => {
    stroke.points.forEach((point) => {
      left = Math.min(left, point.x - margin);
      top = Math.min(top, point.y - margin);
      right = Math.max(right, point.x + margin);
      bottom = Math.max(bottom, point.y + margin);
    });
  });
  return rectsIntersect(bounds, { x: left, y: top, width: right - left, height: bottom - top });
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function setNearestTextureScale(texture: Texture): void {
  const source = (texture as unknown as { source?: { scaleMode?: string } }).source;
  if (source) {
    source.scaleMode = "nearest";
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function fallbackTerrainColor(textureId: string): string {
  let hash = 0;
  for (let i = 0; i < textureId.length; i += 1) {
    hash = (hash * 31 + textureId.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 32% 42%)`;
}

function isStudioTerrainRenderData(value: unknown): value is StudioTerrainRenderData {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as StudioTerrainRenderData).terrainGrid) &&
      typeof (value as StudioTerrainRenderData).width === "number" &&
      typeof (value as StudioTerrainRenderData).height === "number"
  );
}
