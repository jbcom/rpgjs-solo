import { mergeConfig } from "@signe/di";
import { Presets, provideClientGlobalConfig, provideClientModules, provideRpg, startGame } from "@rpgjs/client";
import startServer from "./server";
import { provideTiledMap } from "@rpgjs/tiledmap/client";

startGame(
  mergeConfig({
    providers: [
        provideTiledMap({
          basePath: "map",
        }),
        provideClientGlobalConfig(),
        provideClientModules([{
          spritesheets: [{
            id: 'hero',
            width: 96,
            height: 128,
            image: 'male.png',
            ...Presets.RMSpritesheet(3, 4)
          }, 
          {
            id: 'female',
            width: 96,
            height: 128,
            image: 'female.png',
            ...Presets.RMSpritesheet(3, 4)
          }]
        }]),
    ]
  }, {
    providers: [provideRpg(startServer)],
  })
);