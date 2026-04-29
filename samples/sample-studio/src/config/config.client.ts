import { provideGlobalConfig, Presets } from "@rpgjs/client";
import { provideClientModules } from "@rpgjs/client";
import { configCommon } from "./config.common";
import { provideActionBattle } from "@rpgjs/action-battle/client";
import { provideStudioGame } from "@rpgjs/studio/client";
import { projectId } from "./config.common";

export const configClient = {
  providers: [
    provideStudioGame({
      projectId,
      baseUrl: 'http://localhost:5173',
      assetsUrl: 'http://localhost:5173/api/uploads',
    }),
    provideActionBattle({
      ui: {
        actionBar: {
          enabled: false
        }
      }
    }),
    provideGlobalConfig({
      keyboardControls: {
        up: 'up',
        down: 'down',
        left: 'left',
        right: 'right',
        action: 'space',
        escape: 'escape'
      }
    }),
    ...configCommon.providers,
    provideClientModules([]),
  ],
};
