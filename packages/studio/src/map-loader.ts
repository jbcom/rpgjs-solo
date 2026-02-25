"use client";

import MapComponent from "./components/draw-map.ce";
import MapComponentV2 from "./components/draw-map-v2.ce";
import { inject, RpgClientEngine } from "@rpgjs/client";
import { createSpriteSheetObject, resolveAssetSource } from "./spritesheet-utils";
import { getGameDataProvider } from "./data-provider";

// Type definitions for better type safety
interface GlobalConfig {
  projectId?: string;
  startMapId?: string;
  hero?: {
    graphic?: any;
    faceset?: any;
  };
}

interface RpgClientEngineWithConfig extends RpgClientEngine {
  globalConfig: GlobalConfig;
}

type DrawRuleRect = [number, number, number, number];

interface RuntimeDrawRule {
  id: string;
  elementId: string;
  type: "repeat-axis" | "edge-repeat" | "frame-9slice";
  axis: "x" | "y";
  rects: Record<string, DrawRuleRect>;
}

interface TilesetElementEntry {
  element: any;
  index: number;
}

interface TilesetElementsIndex {
  elements: any[];
  mapById: Map<string, TilesetElementEntry>;
  mapByIndex: Map<string, TilesetElementEntry>;
  drawRuleByElementId: Map<string, RuntimeDrawRule>;
  drawRuleById: Map<string, RuntimeDrawRule>;
}

let firstMapLoaded = false;

export const loadMap = async (mapId: string) => {
  const client = inject(RpgClientEngine) as RpgClientEngineWithConfig;
  const urlParams = new URLSearchParams(window.location.search);
  const mapIdFromUrl = urlParams.get("map");
  const gameParam = urlParams.get("game");
  
  // Determine the final map ID to load
  let finalMapId: string | undefined;
  
  if (!firstMapLoaded) {
    // First map load: prioritize URL parameters
    if (mapIdFromUrl) {
      finalMapId = mapIdFromUrl;
    } else if (gameParam !== null && client.globalConfig?.startMapId) {
      // If ?game is present, use startMapId from project config
      finalMapId = client.globalConfig.startMapId;
    } else if (mapId) {
      finalMapId = mapId;
    }
  } else {
    // Subsequent map loads: use the provided mapId
    finalMapId = mapId;
  }
  
  // Fallback: if still no mapId, try startMapId from config
  if (!finalMapId && client.globalConfig?.startMapId) {
    finalMapId = client.globalConfig.startMapId;
  }
  
  if (!finalMapId) {
    throw new Error('No map ID available to load');
  }

  const mapResponse = await getGameDataProvider().getMap(finalMapId);
  
  const params = mapResponse.params ?? {};
  const isV2 = mapResponse.creationDetails?.version === 'v2';
  if (params.backgroundMusic && typeof params.backgroundMusic === "string") {
    params.backgroundMusic = resolveAssetSource(params.backgroundMusic);
  }
  // Merge polygons with hitboxes to create polygon-based hitboxes
  const mergedHitboxes = [...(mapResponse.hitboxes ?? [])];
  
  // Add polygons as hitboxes with points
  if (mapResponse.polygons && Array.isArray(mapResponse.polygons)) {
    mapResponse.polygons.forEach((polygon: number[][], index: number) => {
      if (polygon && Array.isArray(polygon) && polygon.length >= 3) {
        mergedHitboxes.push({
          id: `polygon_${index}`,
          points: polygon,
          // Keep x, y, width, height for backward compatibility
          x: Math.min(...polygon.map(point => point[0])),
          y: Math.min(...polygon.map(point => point[1])),
          width: Math.max(...polygon.map(point => point[0])) - Math.min(...polygon.map(point => point[0])),
          height: Math.max(...polygon.map(point => point[1])) - Math.min(...polygon.map(point => point[1])),
        });
      }
    });
  }

  const mapDataValue = Array.isArray(mapResponse.data)
    ? mapResponse.data
    : JSON.parse(mapResponse.data ?? "[]");

  const map = {
    ...mapResponse,
    id: mapResponse._id,
    fullImage: resolveAssetSource(mapResponse.fullImage),
    gridImage: resolveAssetSource(mapResponse.gridImage),
    data: mapDataValue,
    hitboxes: mergedHitboxes,
    events: mapResponse.events ?? [],
    params,
  };

  /**
   * Merges element tileset data with position data to create render objects
   * 
   * @param elementTileset - Array of tileset elements with rect and drawIn data
   * @param elementsData - Array of position data with x, y, id
   * @param layerNumber - Layer number for z-index calculation (1 for low, 2 for high)
   * @returns Array of merged elements ready for rendering
   * 
   * @example
   * ```ts
   * const mergedElements = mergeElementsWithTileset(elementTileset, elementsLow, 1);
   * ```
   */
  const normalizeTilesets = (value: any): any[] => {
    if (!value) return []
    if (Array.isArray(value)) return value
    return [value]
  }

  const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return value;
  };

  const normalizeDimension = (value: unknown, fallback: number): number => {
    const parsed = toFiniteNumber(value);
    if (parsed === null) return Math.max(1, Math.round(fallback));
    return Math.max(1, Math.round(parsed));
  };

  const normalizeDrawRuleRect = (value: unknown): DrawRuleRect | null => {
    if (!Array.isArray(value) || value.length < 4) return null;
    const x = toFiniteNumber(value[0]);
    const y = toFiniteNumber(value[1]);
    const width = toFiniteNumber(value[2]);
    const height = toFiniteNumber(value[3]);
    if (x === null || y === null || width === null || height === null) {
      return null;
    }
    return [
      Math.round(x),
      Math.round(y),
      Math.max(1, Math.round(width)),
      Math.max(1, Math.round(height)),
    ];
  };

  const normalizeRuntimeDrawRule = (value: unknown): RuntimeDrawRule | null => {
    if (!value) return null;
    let source = value;

    if (typeof source === 'string') {
      try {
        source = JSON.parse(source);
      } catch {
        return null;
      }
    }

    if (!source || typeof source !== 'object') return null;
    const candidate = source as Record<string, unknown>;
    const typeRaw = candidate['type'];
    if (
      typeRaw !== 'repeat-axis' &&
      typeRaw !== 'edge-repeat' &&
      typeRaw !== 'frame-9slice'
    ) {
      return null;
    }

    const elementIdRaw = candidate['elementId'];
    if (elementIdRaw === undefined || elementIdRaw === null) return null;

    const rectsRaw = candidate['rects'];
    if (!rectsRaw || typeof rectsRaw !== 'object') return null;

    const rects: Record<string, DrawRuleRect> = {};
    Object.entries(rectsRaw as Record<string, unknown>).forEach(([key, rectValue]) => {
      const normalizedRect = normalizeDrawRuleRect(rectValue);
      if (normalizedRect) {
        rects[key] = normalizedRect;
      }
    });

    if (Object.keys(rects).length === 0) return null;

    return {
      id: typeof candidate['id'] === 'string' ? candidate['id'] : '',
      elementId: String(elementIdRaw),
      type: typeRaw,
      axis: typeRaw === 'frame-9slice' ? 'x' : candidate['axis'] === 'y' ? 'y' : 'x',
      rects,
    };
  };

  const parseTilesetDrawRules = (rawRules: unknown): RuntimeDrawRule[] => {
    if (!rawRules) return [];
    let parsed = rawRules;

    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return [];
      }
    }

    if (!parsed || typeof parsed !== 'object') return [];
    const rules = (parsed as { rules?: unknown[] }).rules;
    if (!Array.isArray(rules)) return [];

    return rules
      .map((rule) => normalizeRuntimeDrawRule(rule))
      .filter((rule): rule is RuntimeDrawRule => rule !== null);
  };

  const parseTilesetElements = (rawElements: unknown): any[] => {
    if (!rawElements) return [];
    if (Array.isArray(rawElements)) return rawElements;
    if (typeof rawElements === 'string') {
      try {
        const parsed = JSON.parse(rawElements);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const buildTilesetElementsMap = (tileset: any): TilesetElementsIndex => {
    const elements = parseTilesetElements(tileset?.metadata?.elements);
    const mapById = new Map<string, TilesetElementEntry>();
    const mapByIndex = new Map<string, TilesetElementEntry>();
    const drawRuleByElementId = new Map<string, RuntimeDrawRule>();
    const drawRuleById = new Map<string, RuntimeDrawRule>();

    elements.forEach((element: any, index: number) => {
      const entry: TilesetElementEntry = { element, index };
      mapByIndex.set(String(index), entry);
      if (element?.id !== undefined && element?.id !== null) {
        mapById.set(String(element.id), entry);
      }
    });

    const drawRules = parseTilesetDrawRules(tileset?.metadata?.drawRules);
    drawRules.forEach((rule) => {
      drawRuleByElementId.set(String(rule.elementId), rule);
      if (rule.id) {
        drawRuleById.set(rule.id, rule);
      }
    });

    return { elements, mapById, mapByIndex, drawRuleByElementId, drawRuleById };
  };

  const resolveTilesetElement = (
    tileset: TilesetElementsIndex,
    elementId: unknown
  ): TilesetElementEntry | null => {
    if (elementId === undefined || elementId === null) return null;
    const key = String(elementId);
    if (tileset.mapById.has(key)) {
      return tileset.mapById.get(key) || null;
    }
    if (tileset.mapByIndex.has(key)) {
      return tileset.mapByIndex.get(key) || null;
    }
    return null;
  };

  const resolveDrawRuleForElement = (
    elementData: any,
    tileset: TilesetElementsIndex,
    entry: TilesetElementEntry | null
  ): RuntimeDrawRule | undefined => {
    const drawRuleId =
      typeof elementData?.drawRuleId === 'string' && elementData.drawRuleId.length > 0
        ? elementData.drawRuleId
        : null;

    if (drawRuleId && tileset.drawRuleById.has(drawRuleId)) {
      return tileset.drawRuleById.get(drawRuleId);
    }

    const rawId = elementData?.id;
    if (rawId !== undefined && rawId !== null) {
      const byRawId = tileset.drawRuleByElementId.get(String(rawId));
      if (byRawId) {
        return byRawId;
      }
    }

    if (entry) {
      const entryId =
        entry.element?.id !== undefined && entry.element?.id !== null
          ? String(entry.element.id)
          : String(entry.index);
      const byEntryId = tileset.drawRuleByElementId.get(entryId);
      if (byEntryId) {
        return byEntryId;
      }
      return tileset.drawRuleByElementId.get(String(entry.index));
    }

    const directRule = normalizeRuntimeDrawRule(elementData?.drawRule);
    if (directRule) {
      return directRule;
    }

    return undefined;
  }

  const mergeElementsWithTilesets = (
    tilesetsById: Map<string, TilesetElementsIndex>,
    elementsData: any[],
    layerNumber: number,
    fallbackTilesetId?: string
  ): any[] => {
    if (!elementsData || elementsData.length === 0) {
      return []
    }

    const mergedElements: any[] = []
    elementsData.forEach((element) => {
      const tilesetId = String(element.tilesetId || fallbackTilesetId || '')
      const tileset = tilesetsById.get(tilesetId)
      if (!tileset) return

      const entry = resolveTilesetElement(tileset, element.id)
      if (!entry) return

      const tilesetElement = entry.element
      const rect = tilesetElement?.rect
      if (!Array.isArray(rect) || rect.length < 4) return

      const sourceWidth = toFiniteNumber(rect[2])
      const sourceHeight = toFiniteNumber(rect[3])
      if (sourceWidth === null || sourceHeight === null) return

      const x = toFiniteNumber(element.x)
      const y = toFiniteNumber(element.y)
      if (x === null || y === null) return

      const drawWidth = normalizeDimension(element.width, sourceWidth)
      const drawHeight = normalizeDimension(element.height, sourceHeight)
      const zIndexOffset = toFiniteNumber(element.zIndexOffset) ?? 0
      const drawRule = resolveDrawRuleForElement(element, tileset, entry)

      const mergedElement: Record<string, unknown> = {
        ...tilesetElement,
        tilesetId,
        drawIn: [Math.round(x), Math.round(y), drawWidth, drawHeight],
        layer: () => layerNumber,
        // Instance overrides take priority over tileset defaults
        scale: element.scale !== undefined ? element.scale : tilesetElement.scale,
        hasShadow:
          typeof element.hasShadow === 'boolean'
            ? element.hasShadow
            : tilesetElement.hasShadow,
        lightSpot: element.lightSpot !== undefined ? element.lightSpot : tilesetElement.lightSpot,
        zIndexOffset,
      }

      if (drawRule) {
        mergedElement.drawRule = drawRule
      }

      const drawRuleId =
        typeof element.drawRuleId === 'string' && element.drawRuleId.length > 0
          ? element.drawRuleId
          : drawRule?.id

      if (drawRuleId) {
        mergedElement.drawRuleId = drawRuleId
      }

      mergedElements.push(mergedElement)
    })

    return mergedElements
  }

  /**
   * Merges hitboxes from elementTileset with map hitboxes
   * 
   * @param elementTileset - Array of tileset elements that may contain hitbox data
   * @param elementsData - Array of position data with x, y, id
   * @param existingHitboxes - Array of existing map hitboxes
   * @returns Array of merged hitboxes including elementTileset hitboxes
   * 
   * @example
   * ```ts
   * const mergedHitboxes = mergeElementTilesetHitboxes(elementTileset, elementsLow, map.hitboxes);
   * ```
   */
  const mergeElementTilesetHitboxes = (
    tilesetsById: Map<string, TilesetElementsIndex>,
    elementsData: any[],
    existingHitboxes: any[],
    fallbackTilesetId?: string
  ): any[] => {
    if (!elementsData || elementsData.length === 0) {
      return existingHitboxes
    }

    const mergedHitboxes = [...existingHitboxes]

  // Process each element in the map
  elementsData.forEach((element, index) => {
    const tilesetId = String(element.tilesetId || fallbackTilesetId || '')
    const tileset = tilesetsById.get(tilesetId)
    if (!tileset) return
    const entry = resolveTilesetElement(tileset, element.id)
    const tilesetElement = entry?.element
    if (tilesetElement && tilesetElement.hitbox && tilesetElement.hitbox.type != 'none') {
      const elementX = toFiniteNumber(element.x)
      const elementY = toFiniteNumber(element.y)
      if (elementX === null || elementY === null) return

      // Calculate the absolute position of the hitbox
      // Get the hitbox relative to the element
      const hitbox = tilesetElement.hitbox
      const sourceRect = Array.isArray(tilesetElement.rect) ? tilesetElement.rect : null
      const sourceRectWidth = sourceRect ? toFiniteNumber(sourceRect[2]) : null
      const sourceRectHeight = sourceRect ? toFiniteNumber(sourceRect[3]) : null
      
      // Apply scale if present
      let scaleX = 1
      let scaleY = 1
      const scaleSource = element.scale !== undefined ? element.scale : tilesetElement.scale
      if (scaleSource) {
        if (Array.isArray(scaleSource)) {
          scaleX = scaleSource[0] || 1
          scaleY = scaleSource[1] || 1
        } else if (typeof scaleSource === 'number') {
          scaleX = scaleSource
          scaleY = scaleSource
        } else if (typeof scaleSource === 'object') {
          scaleX = (scaleSource as { x?: number }).x || 1
          scaleY = (scaleSource as { y?: number }).y || scaleX
        } else {
          scaleX = 1
          scaleY = 1
        }
      }
      scaleX = scaleX > 0 ? scaleX : 1
      scaleY = scaleY > 0 ? scaleY : 1

      const hitboxX = toFiniteNumber(hitbox.x) ?? 0
      const hitboxY = toFiniteNumber(hitbox.y) ?? 0
      const hitboxWidth = toFiniteNumber(hitbox.width) ?? 0
      const hitboxHeight = toFiniteNumber(hitbox.height) ?? 0

      // If the element has been resized on the map, stretch hitbox accordingly.
      const effectiveSourceWidth =
        sourceRectWidth && sourceRectWidth > 0 ? sourceRectWidth : Math.max(1, hitboxWidth)
      const effectiveSourceHeight =
        sourceRectHeight && sourceRectHeight > 0 ? sourceRectHeight : Math.max(1, hitboxHeight)
      const instanceWidth = normalizeDimension(element.width, effectiveSourceWidth)
      const instanceHeight = normalizeDimension(element.height, effectiveSourceHeight)
      const widthRatio = instanceWidth / effectiveSourceWidth
      const heightRatio = instanceHeight / effectiveSourceHeight
      const finalScaleX = scaleX * widthRatio
      const finalScaleY = scaleY * heightRatio

      // Create the absolute hitbox with scale applied
      const absoluteHitbox = {
        id: `element_${index}_${tilesetElement.id}`,
        x: elementX + (hitboxX * finalScaleX),
        y: elementY + (hitboxY * finalScaleY),
        width: hitboxWidth * finalScaleX,
        height: hitboxHeight * finalScaleY,
        type: hitbox.type || 'rectangle'
      }

      mergedHitboxes.push(absoluteHitbox)
    }
  })

    return mergedHitboxes
  }

  const primaryElementTileset = map.params.tileset
  const elementTilesets = normalizeTilesets(map.params.elementTilesets)
  const resolvedElementTilesets = elementTilesets.length > 0 ? elementTilesets : (primaryElementTileset ? [primaryElementTileset] : [])
  const tilesetsById = new Map<string, TilesetElementsIndex>()
  resolvedElementTilesets.forEach((tileset: any) => {
    const tilesetId = String(tileset?._id || tileset?.id || '')
    if (!tilesetId) return
    tilesetsById.set(tilesetId, buildTilesetElementsMap(tileset))
  })

  // Merge elementTileset with elementsAlwaysLow, elementsLow and elementsHigh
  const elementsAlwaysLow = isV2 ? JSON.parse(map.elementsAlwaysLow ?? '[]') : []
  const elementsLow = isV2 ? JSON.parse(map.elementsLow ?? '[]') : []
  const elementsHigh = isV2 ? JSON.parse(map.elementsHigh ?? '[]') : []
  
  const fallbackElementTilesetId = String(map.params.primaryElementTileset || primaryElementTileset?._id || primaryElementTileset?.id || '')
  const mergedElementsAlwaysLow = mergeElementsWithTilesets(tilesetsById, elementsAlwaysLow, 0, fallbackElementTilesetId)
  const mergedElementsLow = mergeElementsWithTilesets(tilesetsById, elementsLow, 1, fallbackElementTilesetId)
  const mergedElementsHigh = mergeElementsWithTilesets(tilesetsById, elementsHigh, 2, fallbackElementTilesetId)
  
  // Merge hitboxes from elementTileset with existing map hitboxes
  // Note: Only elementsLow generate hitboxes (elementsAlwaysLow and elementsHigh don't)
  let finalHitboxes = map.hitboxes
  if (isV2 && tilesetsById.size > 0) {
    // Merge hitboxes only from elementsLow (always-low and high don't have hitboxes)
    finalHitboxes = mergeElementTilesetHitboxes(tilesetsById, elementsLow, finalHitboxes, fallbackElementTilesetId)
  }

  /**
   * Generates collision hitboxes from Wang tiles terrain data
   * 
   * @param terrain - 2D array containing tile IDs for each position
   * @param wangsets - Parsed Wang sets configuration containing collision information
   * @param mapWidth - Width of the map in tiles
   * @param mapHeight - Height of the map in tiles
   * @param tileWidth - Width of each tile in pixels (default: 48)
   * @param tileHeight - Height of each tile in pixels (default: 48)
   * @returns Array of collision hitboxes
   * 
   * @example
   * ```ts
   * const collisionHitboxes = generateCollisionHitboxes(terrain, wangsets, 20, 15, 48, 48);
   * ```
   */
  const generateCollisionHitboxes = (
    terrain: number[][],
    wangsets: any[],
    mapWidth: number,
    mapHeight: number,
    tileWidth: number = 48,
    tileHeight: number = 48
  ): any[] => {
    if (!terrain || !wangsets || wangsets.length === 0) {
      return [];
    }

    // Create a map of tile ID to collision information from wangsets
    const collisionMap = new Map<number, boolean>();
    
    wangsets.forEach(wangset => {
      if (wangset.wangcolors && Array.isArray(wangset.wangcolors)) {
        wangset.wangcolors.forEach((wangcolor: any) => {
          if (wangcolor.tile !== undefined && wangcolor.tile !== -1) {
            collisionMap.set(wangcolor.tile, wangcolor.collision === true);
          }
        });
      }
    });

    const collisionHitboxes: any[] = [];

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        // Get tile ID from terrain array
        const tileId = terrain[y]?.[x];
        
        if (tileId !== undefined && tileId !== -1 && collisionMap.has(tileId)) {
          const hasCollision = collisionMap.get(tileId);
          
          if (hasCollision) {
            const pixelX = x * tileWidth;
            const pixelY = y * tileHeight;
            
            const hitbox = {
              id: `terrain_collision_${x}_${y}`,
              x: pixelX,
              y: pixelY,
              width: tileWidth,
              height: tileHeight,
              properties: {
                type: "terrain_collision",
                tileX: x,
                tileY: y,
                tileId: tileId,
                source: "wang_terrain"
              },
            };

            collisionHitboxes.push(hitbox);
          }
        }
      }
    }

    return collisionHitboxes;
  };

  // Parse wangsets and generate collision hitboxes if baseTerrain exists
  let wangsetsCollisionHitboxes: any[] = [];
  const terrainByTileset = isV2
    ? (typeof map.terrainByTileset === 'string' ? JSON.parse(map.terrainByTileset ?? '[]') : (map.terrainByTileset || []))
    : []
  const resolveTilesetId = (value: any): string => {
    if (!value) return ''
    if (typeof value === 'string') return value
    return String(value?._id || value?.id || '')
  }

  if (map.params.baseTerrain && map.params.baseTerrain.metadata && map.params.baseTerrain.metadata.wangsets) {
    try {
      const wangsets = JSON.parse(map.params.baseTerrain.metadata.wangsets);
      
      if (isV2 && map.terrain) {
        let terrain = JSON.parse(map.terrain ?? '[]');
        const primaryTerrainId = resolveTilesetId(map.params.primaryTerrainTileset) || resolveTilesetId(map.params.baseTerrain);
        if (primaryTerrainId && Array.isArray(terrainByTileset) && terrainByTileset.length > 0) {
          const primaryLayer = terrainByTileset.find((layer: any) => resolveTilesetId(layer.tilesetId || layer.id) === primaryTerrainId);
          if (primaryLayer?.tiles) {
            terrain = primaryLayer.tiles;
          }
        }
        wangsetsCollisionHitboxes = generateCollisionHitboxes(
          terrain,
          wangsets,
          map.params.width,
          map.params.height,
          48,
          48
        );
      }
    } catch (error) {
      console.warn('Failed to parse wangsets for collision detection:', error);
    }
  }
  
  // Merge Wang tiles collision hitboxes with existing hitboxes
  const allHitboxes = [...finalHitboxes, ...wangsetsCollisionHitboxes];

  firstMapLoaded = true;

  return {
    id: finalMapId,
    data: {
      ...map,
      elementsAlwaysLow: isV2 ? mergedElementsAlwaysLow : [],
      elementsLow: isV2 ? mergedElementsLow : [],
      elementsHigh: isV2 ? mergedElementsHigh : [],
      terrain: isV2 ? JSON.parse(map.terrain ?? '[]') : [],
      terrainByTileset: isV2 ? terrainByTileset : [],
    },
    hitboxes: allHitboxes,
    component: isV2 ? MapComponentV2 : MapComponent,
    config: client.globalConfig,
    events: map.events,
    width: isV2 ? map.params.width * 48 : map.params.width,
    height: isV2 ? map.params.height * 48 : map.params.height,
    params: {
      backgroundMusic: map.params.backgroundMusic,
    }
  };
};
