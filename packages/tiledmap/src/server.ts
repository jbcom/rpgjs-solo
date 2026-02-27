import { RpgMap, RpgServer } from "@rpgjs/server";
import { MapClass } from "@canvasengine/tiled";
import { defineModule } from "@rpgjs/common";
import {
  applyTiledPointEvents,
  attachTiledCollisionToEntity,
  detachTiledCollisionFromEntity,
  prepareTiledPhysicsData,
  resetTiledCollisionHandlers,
} from "./physics";

declare module "@rpgjs/server" {
  interface RpgMap {
    tiled?: MapClass;
  }
}

export interface RpgTiledMap extends RpgMap {
  tiled: MapClass;
}

export default defineModule<RpgServer>({
  map: {
    onBeforeUpdate<T = RpgMap>(mapData: any, map: T): T {
      prepareTiledPhysicsData(mapData, map as any);
      applyTiledPointEvents(mapData);
      return map;
    },
    onPhysicsInit(map: any, context: { mapData: any }) {
      if (!map?._blockedTiles || !map?.tiled) {
        prepareTiledPhysicsData(context?.mapData, map);
      }
    },
    onPhysicsEntityAdd(map: any, context: { owner: any }) {
      attachTiledCollisionToEntity(context?.owner, map);
    },
    onPhysicsEntityRemove(map: any, context: { owner: any }) {
      detachTiledCollisionFromEntity(context?.owner, map);
    },
    onPhysicsReset(map: any) {
      resetTiledCollisionHandlers(map);
    },
  },
});
