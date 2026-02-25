import { provideGlobalConfig, Presets } from "@rpgjs/client";
import { provideClientModules } from "@rpgjs/client";
import { configCommon } from "./config.common";
import { provideActionBattle } from "@rpgjs/action-battle/client";
import { provideStudioGame } from "@rpgjs/studio/client";

export const configClient = {
  providers: [
    provideStudioGame({
      projectId: '8398a00a-8a9b-41d5-aae3-77786643b790',
      apiBaseUrl: 'http://localhost:4200/api'
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
