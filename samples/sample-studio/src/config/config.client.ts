import { provideGlobalConfig, Presets } from "@rpgjs/client";
import { provideClientModules } from "@rpgjs/client";
import { configCommon } from "./config.common";
import { provideActionBattle } from "@rpgjs/action-battle/client";
import { provideStudioGame } from "@rpgjs/studio/client";

export const configClient = {
  providers: [
    provideStudioGame({
      projectId: '04424a49-79d4-4933-b869-077278e430f9',
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
