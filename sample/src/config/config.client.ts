import {
  Presets,
  provideClientGlobalConfig,
  provideClientModules,
  provideLoadMap,
} from "@rpgjs/client";
import Map from "../components/map.ce";
import Shadow from "../components/shadow.ce";

export default {
  providers: [
    provideLoadMap(() => {
       return {
          component: Map,
          width: 2048,
          height: 1536,
       }
    }),
    provideClientGlobalConfig(),
    provideClientModules([
      {
        sprite: {
          componentsBehind: [Shadow],
          onInit: (sprite) => {
            console.log(sprite)
          }
        },
        spritesheets: [
          Presets.LPCSpritesheetPreset({
            id: "hero",
            imageSource: "hero.png",
            width: 1728,
            height: 5568,
            ratio: 1.5,
          }),
          Presets.LPCSpritesheetPreset({
            id: "monster",
            imageSource: "monster.png",
            width: 1728,
            height: 5568,
            ratio: 1.5,
          }),
        ],
      },
    ]),
  ],
};
