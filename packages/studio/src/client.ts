import {
  HudComponent,
  RpgClient,
  RpgClientEngine,
  RpgGui,
  RpgSound,
  TitleScreenComponent,
  inject,
} from "@rpgjs/client";
import { defineModule } from "@rpgjs/common";
import Shadow from "./components/shadow.ce";
import {
  createSpriteSheetObject,
  resolveAssetSource,
  resolveSpritesheet,
} from "./spritesheet-utils";
import FadeComponent from "./components/fade.ce";
import { trigger } from "canvasengine";
import UpComponent from "./components/up.ce";
import {
  getGameDataProvider,
  getStudioGameRuntimeConfig,
} from "./data-provider";
import { StudioGameModuleConfig } from ".";

interface GlobalConfig {
  projectId?: string;
  startMapId?: string;
  hero?: {
    graphic?: any;
    faceset?: any;
  };
}

interface RpgClientEngineWithConfig extends RpgClientEngine {
  globalConfig: GlobalConfig;
}

const fadeTrigger = trigger();

export default (config: StudioGameModuleConfig) => {
  return defineModule<RpgClient>({
    engine: {
      async onStart(engine: RpgClientEngine<any>) {
        const gui = inject(RpgGui);

        await new Promise((resolve) => setTimeout(resolve, 20));

        const gameParam = config.projectId;
        const configuredProjectId = getStudioGameRuntimeConfig().projectId;

        let response: any = {};
        const provider = getGameDataProvider();

        // Configuration projectId takes precedence over URL mode.
        if (configuredProjectId) {
          response = await provider.getProject({
            projectId: configuredProjectId,
          });
        }
        // If ?game parameter is present, fetch project by projectId
        // gameParam should contain the projectId (e.g., ?game=projectId)
        else if (gameParam !== null) {
          const projectId = gameParam;
          response = await provider.getProject({ projectId });
        }

        if (response.keyboardControls) {
          response.keyboardControls.escape = response.keyboardControls.back;
        }

        window.gameConfig = response;

        engine.globalConfig = {
          ...engine.globalConfig,
          ...response,
          projectId: response._id || engine.globalConfig?.projectId,
          startMapId: response.startMapId || engine.globalConfig?.startMapId,
        };

        const mediaData = [];

        if (engine.globalConfig.hero?.graphic) {
          mediaData.push(engine.globalConfig.hero.graphic);
        }

        if (engine.globalConfig.hero?.faceset) {
          mediaData.push(engine.globalConfig.hero.faceset);
        }

        // Load all spritesheets in parallel
        await Promise.all(
          mediaData.map(async (media) => {
            engine.addSpriteSheet(
              await createSpriteSheetObject(media, media.id),
            );
          }),
        );

        if (gameParam) {
          gui.display("rpg-title-screen", {
            title: response.name,
            subtitle: response.subtitle,
            version: "v1.0.0",
            localActions: true,
            saveLoad: {
              mode: "load",
              slots: [null, null, null],
            },
            entries: [
              { id: "start", label: "Start" },
              { id: "load", label: "Load" },
            ],
          });
        }
      },
    },
    sprite: {
      componentsBehind: [Shadow],
    },
    sceneMap: {
      onBeforeLoading: (scene) => {
        const gui = inject(RpgGui);
        gui.display("fade", {
          fadeTrigger,
        });
      },
      onAfterLoading: async (scene) => {
        const gui = inject(RpgGui);
        const engine = inject(RpgClientEngine);
        engine.scene.clearLocalWeather?.();
        fadeTrigger.start();
        gui.display("hud", {
          faceset: {
            id: engine.globalConfig?.hero.faceset?.id,
            expression: "happy",
          },
        });
      },
    },
    gui: [
      {
        id: "rpg-title-screen",
        component: TitleScreenComponent,
      },
      {
        id: "fade",
        component: FadeComponent,
      },
      {
        id: "hud",
        component: HudComponent,
        dependencies: () => {
          const engine = inject(RpgClientEngine);
          return [engine.scene.currentPlayer];
        },
      },
    ],
    spritesheetResolver: async (id: string) => {
      return resolveSpritesheet(id);
    },
    soundResolver: async (id: string) => {
      RpgSound.global.stop();
      try {
        const media = await getGameDataProvider().getMedia(id);
        return {
          id,
          src: resolveAssetSource(media.fileName),
        };
      } catch (error) {
        console.error(`Error resolving sound ${id}:`, error);
      }
    },

    componentAnimations: [
      {
        id: "up",
        component: UpComponent,
      },
    ],
  });
};
