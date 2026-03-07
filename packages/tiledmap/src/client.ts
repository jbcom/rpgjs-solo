import { RpgClient } from "@rpgjs/client";
import { defineModule } from "@rpgjs/common";
import { prepareTiledPhysicsData } from "./physics";

export default defineModule<RpgClient>({
  componentAnimations: [],
  sceneMap: {
    onPhysicsInit(map: any, context: { mapData: any }) {
      prepareTiledPhysicsData(context?.mapData, map);
    },
  },
});
