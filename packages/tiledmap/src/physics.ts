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
const START_POSITION_NAME = "start";

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
  mapData.positions = mergeTiledPositions(mapData.positions, collectTiledPointPositions(mapData.parsedMap.objects));
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
        if (
          obj.name &&
          eventEntry?.x === undefined &&
          eventEntry?.y === undefined &&
          getEventName(eventEntry) === obj.name
        ) {
          const isWrappedEvent = eventEntry && typeof eventEntry === "object" && "event" in eventEntry;
          return {
            ...(isWrappedEvent ? eventEntry : { event: eventEntry }),
            x: obj.x,
            y: obj.y,
          };
        }
        return eventEntry;
      })
      .filter((eventEntry: any) => eventEntry !== null);
  }
}

function collectTiledPointPositions(objects: any): Record<string, { x: number; y: number }> {
  if (!Array.isArray(objects)) {
    return {};
  }

  const positions: Record<string, { x: number; y: number }> = {};

  for (const obj of objects) {
    if (!obj?.point || typeof obj.x !== "number" || typeof obj.y !== "number") {
      continue;
    }

    if (typeof obj.name === "string" && obj.name.length > 0) {
      positions[obj.name] = { x: obj.x, y: obj.y };
    }

    if (
      !positions[START_POSITION_NAME] &&
      (obj.class === START_POSITION_NAME || obj.type === START_POSITION_NAME)
    ) {
      positions[START_POSITION_NAME] = { x: obj.x, y: obj.y };
    }
  }

  return positions;
}

function mergeTiledPositions(existingPositions: any, tiledPositions: Record<string, { x: number; y: number }>) {
  return {
    ...(existingPositions && typeof existingPositions === "object" ? existingPositions : {}),
    ...tiledPositions,
  };
}

function getEventName(eventEntry: any): string | undefined {
  const event = eventEntry?.event ?? eventEntry;

  if (typeof event === "function") {
    const staticEventName = (event as any)._name;
    const prototypeEventName = (event as any).prototype?._name;
    const staticName = (event as any).name;
    const prototypeName = (event as any).prototype?.name;
    if (typeof prototypeEventName === "string") {
      return prototypeEventName;
    }
    if (typeof staticEventName === "string") {
      return staticEventName;
    }
    if (typeof prototypeName === "string") {
      return prototypeName;
    }
    if (typeof staticName === "string") {
      return staticName;
    }
  }

  if (typeof event?.name === "string") {
    return event.name;
  }

  return undefined;
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
