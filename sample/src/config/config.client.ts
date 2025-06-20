import {
  Presets,
  provideClientGlobalConfig,
  provideClientModules,
} from "@rpgjs/client";
import { provideTiledMap } from "@rpgjs/tiledmap/client";

export default {
  providers: [
    provideTiledMap({
      basePath: "map",
    }),
    provideClientGlobalConfig(),
    provideClientModules([
      {
        spritesheets: [
          {
            id: "hero",
            width: 96,
            height: 128,
            image: "male.png",
            ...Presets.RMSpritesheet(3, 4),
          },
          {
            id: "female",
            width: 96,
            height: 128,
            image: "female.png",
            ...Presets.RMSpritesheet(3, 4),
          },
        ],
      },
    ]),
  ],
};
