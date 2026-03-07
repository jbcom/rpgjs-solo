import { MapClass } from "@canvasengine/tiled";

type AnyMap = {
  tiled?: MapClass;
};

type RectHitbox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const TILED_HITBOX_ID_PREFIX = "__tiled_collision__:";

export function prepareTiledPhysicsData(mapData: any, map: AnyMap): void {
  if (!mapData?.parsedMap) {
    return;
  }

  const tiledMap = new MapClass(mapData.parsedMap);
  map.tiled = tiledMap;

  const tiledHitboxes = collectBlockedTileHitboxes(tiledMap);
  mapData.hitboxes = mergeTiledHitboxes(mapData.hitboxes, tiledHitboxes);
  mapData.width = tiledMap.widthPx;
  mapData.height = tiledMap.heightPx;
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

function collectBlockedTileHitboxes(tiledMap: MapClass): RectHitbox[] {
  const hitboxes: RectHitbox[] = [];
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
        hitboxes.push({
          id: createTiledHitboxId(x, y),
          x: x * tileWidth,
          y: y * tileHeight,
          width: tileWidth,
          height: tileHeight,
        });
      }
    }
  }

  return hitboxes;
}

function mergeTiledHitboxes(existingHitboxes: any, tiledHitboxes: RectHitbox[]): any[] {
  const preservedHitboxes = Array.isArray(existingHitboxes)
    ? existingHitboxes.filter((hitbox) => !isGeneratedTiledHitbox(hitbox))
    : [];

  return [...preservedHitboxes, ...tiledHitboxes];
}

function isGeneratedTiledHitbox(hitbox: any): boolean {
  return typeof hitbox?.id === "string" && hitbox.id.startsWith(TILED_HITBOX_ID_PREFIX);
}

function createTiledHitboxId(x: number, y: number): string {
  return `${TILED_HITBOX_ID_PREFIX}${x},${y}`;
}
