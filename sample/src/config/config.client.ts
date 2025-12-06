import {
  BoxComponent,
  inject,
  KeyboardControls,
  Presets,
  provideClientGlobalConfig,
  provideClientModules,
  provideLoadMap,
  RpgClientEngine,
  RpgGui,
  Sound,
  
} from "@rpgjs/client";
import Map from "../components/map.ce";
import Shadow from "../components/shadow.ce";
import HpBar from "../../../packages/client/src/components/prebuilt/hp-bar.ce";
import WoodComponent from "../components/wood.ce";
import WoodUiComponent from "../components/wood-ui.ce";
import VueComponent from "../vue-component-with-injections.vue";
import { signal, effect } from 'canvasengine'
import { provideVueGui } from "@rpgjs/vue";
import { provideTiledMap } from "@rpgjs/tiledmap/client";
import { provideMain } from "../modules/main";
import TooltipComponent from "../components/tooltip.ce";


export default {
  providers: [
    provideLoadMap((id: string) => {
       return {
          id,
          component: Map,
          width: 2048,
          height: 1536,
          data: {
            color: id === "simplemap" ? "red" : "blue"
          },
          hitboxes: [],
       }
    }),
    // provideTiledMap({
    //   basePath: "map"
    // }),
    provideVueGui(),
    provideClientGlobalConfig(),
    provideMain(),
    provideClientModules([
      {
        spritesheetResolver: (id: string) => {
          if (id === "hero") {
            return Presets.LPCSpritesheetPreset({
              id: "hero",
              imageSource: "hero.png",
              width: 1728,
              height: 5568,
              ratio: 1.5,
            })
          }
          else if (id === "monster") {
            return Presets.LPCSpritesheetPreset({
              id: "monster",
              imageSource: "monster.png",
              width: 1728,
              height: 5568,
              ratio: 1.5,
            })
          }
          return undefined;
        },
        sprite: {
          componentsBehind: [Shadow],
          onInit: (sprite) => {
            sprite.wood = signal(0)
          }
        },
        sceneMap: {
          onAfterLoading: (scene) => {

          },
        },
        sounds: [
          {
            id: "typewriter",
            src: "typewriter.wav",
          },
          {
            id: "cursor",
            src: "cursor.wav",
          },
          {
            id: "bgm",
            src: "music.mp3"
          }
        ],
        spritesheets: [
          Presets.FacesetPreset({
            id: "facesetId",
            image: "faceset.png",
            width: 1024,
            height: 1024,
          }, 3, 4, {
            happy: [0, 0],
            sad: [1, 0],
          }),
        
          Presets.LPCSpritesheetPreset({
            id: "monster",
            imageSource: "monster.png",
            width: 1728,
            height: 5568,
            ratio: 1.5,
          }),
          {
            id: "animation",
            width: 1024,
            height: 1024,
            image: "exp.png",
            ...Presets.AnimationSpritesheetPreset(4, 4),
          }
        ],
        gui: [
          {
            id: "wood-ui",
            component: WoodUiComponent,
            autoDisplay: true,
            dependencies: () => {
              const engine = inject(RpgClientEngine)
              return [engine.scene.currentPlayer]
            }
          },
          VueComponent,
          {
            id: "my-tooltip",
            component: TooltipComponent,
            attachToSprite: true
          }
        ],
        componentAnimations: [
          {
            id: "wood",
            component: WoodComponent,
          },
        ],
      },
    ]),
  ],
};
