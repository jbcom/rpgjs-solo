import { RpgMap, RpgServer } from "@rpgjs/server";
import { MapClass } from "@canvasengine/tiled";
import { defineModule } from "@rpgjs/common";
import { applyTiledPointEvents, prepareTiledPhysicsData } from "./physics";

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
      prepareTiledPhysicsData(context?.mapData, map);
    },
  },
});
