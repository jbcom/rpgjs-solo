import { RpgClient } from "@rpgjs/client";
import { defineModule } from "@rpgjs/common";
import {
  attachTiledCollisionToEntity,
  detachTiledCollisionFromEntity,
  prepareTiledPhysicsData,
  resetTiledCollisionHandlers,
} from "./physics";

export default defineModule<RpgClient>({
  componentAnimations: [],
  sceneMap: {
    onPhysicsInit(map: any, context: { mapData: any }) {
      prepareTiledPhysicsData(context?.mapData, map);
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
