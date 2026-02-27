import { MapClass } from "@canvasengine/tiled";

type AnyMap = {
  tiled?: MapClass;
  physic?: {
    getEntityByUUID(id: string): any;
  };
  _blockedTiles?: Set<string>;
  _tiledTileWidth?: number;
  _tiledTileHeight?: number;
  _tiledCollisionUnsubscribers?: Map<string, () => void>;
};

export function prepareTiledPhysicsData(mapData: any, map: AnyMap): void {
  if (!mapData?.parsedMap) {
    return;
  }

  const tiledMap = new MapClass(mapData.parsedMap);
  map.tiled = tiledMap;

  mapData.hitboxes = mapData.hitboxes || [];
  mapData.width = tiledMap.widthPx;
  mapData.height = tiledMap.heightPx;

  map._tiledTileWidth = tiledMap.tilewidth;
  map._tiledTileHeight = tiledMap.tileheight;
  map._blockedTiles = collectBlockedTiles(tiledMap);
}

export function applyTiledPointEvents(mapData: any): void {
  const objects = mapData?.parsedMap?.objects;
  if (!Array.isArray(objects) || !Array.isArray(mapData?.events)) {
    return;
  }

  for (const obj of objects) {
    if (!obj?.point) {
      continue;
    }

    mapData.events = mapData.events
      .map((eventEntry: any) => {
        if (eventEntry?.name === obj.name) {
          return {
            event: eventEntry,
            x: obj.x,
            y: obj.y,
          };
        }
        return eventEntry;
      })
      .filter((eventEntry: any) => eventEntry !== null);
  }
}

export function attachTiledCollisionToEntity(owner: any, map: AnyMap): void {
  if (!owner?.id || !map?._blockedTiles) {
    return;
  }

  const entity = map.physic?.getEntityByUUID(owner.id);
  if (!entity || typeof entity.canEnterTile !== "function") {
    return;
  }

  const unsubscribers = ensureUnsubscribers(map);
  const previousUnsubscribe = unsubscribers.get(owner.id);
  if (previousUnsubscribe) {
    previousUnsubscribe();
    unsubscribers.delete(owner.id);
  }

  const blockedTiles = map._blockedTiles;
  const tiledTileWidth = map._tiledTileWidth ?? 32;
  const tiledTileHeight = map._tiledTileHeight ?? 32;
  const physicsTileWidth = 32;
  const physicsTileHeight = 32;

  const unsubscribe = entity.canEnterTile(({ x, y }) => {
    const tiledX = Math.floor((x * physicsTileWidth) / tiledTileWidth);
    const tiledY = Math.floor((y * physicsTileHeight) / tiledTileHeight);
    return !blockedTiles.has(`${tiledX},${tiledY}`);
  });

  unsubscribers.set(owner.id, unsubscribe);
}

export function detachTiledCollisionFromEntity(owner: any, map: AnyMap): void {
  if (!owner?.id) {
    return;
  }
  const unsubscribers = map._tiledCollisionUnsubscribers;
  if (!unsubscribers) {
    return;
  }
  const unsubscribe = unsubscribers.get(owner.id);
  if (!unsubscribe) {
    return;
  }
  unsubscribe();
  unsubscribers.delete(owner.id);
}

export function resetTiledCollisionHandlers(map: AnyMap): void {
  const unsubscribers = map._tiledCollisionUnsubscribers;
  if (unsubscribers) {
    for (const unsubscribe of unsubscribers.values()) {
      unsubscribe();
    }
    unsubscribers.clear();
  }

  map._blockedTiles = undefined;
  map._tiledTileWidth = undefined;
  map._tiledTileHeight = undefined;
}

function collectBlockedTiles(tiledMap: MapClass): Set<string> {
  const blockedTiles = new Set<string>();
  const mapWidth = tiledMap.width;
  const mapHeight = tiledMap.height;
  const tileWidth = tiledMap.tilewidth;
  const tileHeight = tiledMap.tileheight;

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const tileInfo = tiledMap.getTileByPosition(x * tileWidth, y * tileHeight, [0, 0], {
        populateTiles: true,
      });
      if (tileInfo.hasCollision) {
        blockedTiles.add(`${x},${y}`);
      }
    }
  }

  return blockedTiles;
}

function ensureUnsubscribers(map: AnyMap): Map<string, () => void> {
  map._tiledCollisionUnsubscribers = map._tiledCollisionUnsubscribers || new Map();
  return map._tiledCollisionUnsubscribers;
}
