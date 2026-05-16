import { MapClass } from "@canvasengine/tiled";

type AnyMap = {
  tiled?: MapClass;
  [key: string]: any;
};

type ParsedTiledMap = {
  width?: number;
  height?: number;
  tilewidth?: number;
  tileheight?: number;
  layers?: any[];
  tilesets?: any[];
  [key: string]: any;
};

type TileLayer = {
  name?: string;
  data?: any[];
  [key: string]: any;
};

const COMPAT_MARKER = "__rpgjsTiledMapCompat";

/**
 * Adds v4-style map helpers backed by CanvasEngine Tiled.
 */
export function applyTiledMapCompat(map: AnyMap, parsedMap: ParsedTiledMap): void {
  if (!map?.tiled) {
    return;
  }

  const state = (map as any)[COMPAT_MARKER] ?? { parsedMap };
  state.parsedMap = parsedMap;

  if (!(map as any)[COMPAT_MARKER]) {
    Object.defineProperty(map, COMPAT_MARKER, {
      value: state,
      configurable: true,
    });
  }

  defineGetter(map, "layers", () => getLayers(map, state.parsedMap));
  defineGetter(map, "zTileHeight", () => getNumber(map.tiled, state.parsedMap, "zTileHeight", "tileheight"));

  defineMethod(map, "getLayerByName", (name: string) => {
    const tiled = map.tiled as any;
    if (typeof tiled?.getLayerByName === "function") {
      return tiled.getLayerByName(name);
    }
    return getLayers(map, state.parsedMap).find((layer: any) => layer?.name === name);
  });

  defineMethod(map, "getTileIndex", (x: number, y: number) => {
    const tiled = map.tiled as any;
    if (typeof tiled?.getTileIndex === "function") {
      return tiled.getTileIndex(x, y);
    }
    return y * getNumber(map.tiled, state.parsedMap, "width") + x;
  });

  defineMethod(map, "getTileOriginPosition", (x: number, y: number) => {
    const tiled = map.tiled as any;
    if (typeof tiled?.getTileOriginPosition === "function") {
      return tiled.getTileOriginPosition(x, y);
    }
    return {
      x: x * getNumber(map.tiled, state.parsedMap, "tilewidth"),
      y: y * getNumber(map.tiled, state.parsedMap, "tileheight"),
    };
  });

  defineMethod(map, "getTileByPosition", (x: number, y: number, z?: number) => {
    const tiled = map.tiled as any;
    if (typeof tiled?.getTileByPosition === "function") {
      const layerRange = typeof z === "number" ? [z, z] : undefined;
      return tiled.getTileByPosition(x, y, layerRange, { populateTiles: true });
    }
    const tileX = Math.floor(x / getNumber(map.tiled, state.parsedMap, "tilewidth"));
    const tileY = Math.floor(y / getNumber(map.tiled, state.parsedMap, "tileheight"));
    return map.getTileByIndex(map.getTileIndex(tileX, tileY));
  });

  defineMethod(map, "getTileByIndex", (tileIndex: number) => {
    const tiled = map.tiled as any;
    if (typeof tiled?.getTileByIndex === "function") {
      return tiled.getTileByIndex(tileIndex);
    }
    return getTileByIndexFromLayers(getLayers(map, state.parsedMap), tileIndex);
  });

  defineMethod(map, "setTile", (x: number, y: number, layer: string | number, tileInfo: any) => {
    const tiled = map.tiled as any;
    if (typeof tiled?.setTile === "function") {
      return tiled.setTile(x, y, layer, tileInfo);
    }

    const targetLayer = getTargetLayer(getLayers(map, state.parsedMap), layer);
    if (!targetLayer?.data) {
      return undefined;
    }

    const tileIndex = map.getTileIndex(x, y);
    targetLayer.data[tileIndex] = getTileGid(tileInfo);
    return tileInfo;
  });

  defineMethod(map, "updateTileset", (tileset: any) => {
    const tiled = map.tiled as any;
    if (typeof tiled?.updateTileset === "function") {
      return tiled.updateTileset(tileset);
    }

    const nextTilesets = updateTilesets(getTilesets(map, state.parsedMap), tileset);
    tiled.tilesets = nextTilesets;
    state.parsedMap.tilesets = nextTilesets;
    return tileset;
  });
}

function defineGetter(target: AnyMap, name: string, get: () => any): void {
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    get,
  });
}

function defineMethod(target: AnyMap, name: string, value: (...args: any[]) => any): void {
  if (typeof target[name] === "function") {
    return;
  }

  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: false,
    value,
  });
}

function getLayers(map: AnyMap, parsedMap: ParsedTiledMap): any[] {
  const tiled = map.tiled as any;
  return Array.isArray(tiled?.layers) ? tiled.layers : Array.isArray(parsedMap?.layers) ? parsedMap.layers : [];
}

function getTilesets(map: AnyMap, parsedMap: ParsedTiledMap): any[] {
  const tiled = map.tiled as any;
  return Array.isArray(tiled?.tilesets)
    ? tiled.tilesets
    : Array.isArray(parsedMap?.tilesets)
      ? parsedMap.tilesets
      : [];
}

function getNumber(tiled: any, parsedMap: ParsedTiledMap, property: string, fallbackProperty = property): number {
  const value = typeof tiled?.[property] === "number" ? tiled[property] : parsedMap?.[property];
  if (typeof value === "number") {
    return value;
  }
  const fallback = typeof tiled?.[fallbackProperty] === "number" ? tiled[fallbackProperty] : parsedMap?.[fallbackProperty];
  return typeof fallback === "number" ? fallback : 0;
}

function getTileByIndexFromLayers(layers: any[], tileIndex: number): any {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i] as TileLayer;
    const gid = layer?.data?.[tileIndex];
    if (gid) {
      return {
        id: gid,
        gid,
        index: tileIndex,
        layer,
      };
    }
  }
  return undefined;
}

function getTargetLayer(layers: any[], layer: string | number): TileLayer | undefined {
  if (typeof layer === "number") {
    return layers[layer];
  }
  return layers.find((currentLayer: any) => currentLayer?.name === layer);
}

function getTileGid(tileInfo: any): any {
  if (tileInfo && typeof tileInfo === "object") {
    return tileInfo.gid ?? tileInfo.id ?? tileInfo.tileId ?? 0;
  }
  return tileInfo;
}

function updateTilesets(currentTilesets: any[], tileset: any): any[] {
  if (Array.isArray(tileset)) {
    return tileset;
  }

  const nextTilesets = [...currentTilesets];
  const index = nextTilesets.findIndex((currentTileset) => isSameTileset(currentTileset, tileset));
  if (index >= 0) {
    nextTilesets[index] = {
      ...nextTilesets[index],
      ...tileset,
    };
  } else {
    nextTilesets.push(tileset);
  }
  return nextTilesets;
}

function isSameTileset(a: any, b: any): boolean {
  return (
    a &&
    b &&
    ((a.name && a.name === b.name) ||
      (a.source && a.source === b.source) ||
      (a.firstgid !== undefined && a.firstgid === b.firstgid))
  );
}
