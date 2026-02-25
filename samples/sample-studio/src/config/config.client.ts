import { provideGlobalConfig, Presets } from "@rpgjs/client";
import { provideClientModules } from "@rpgjs/client";
import { configCommon } from "./config.common";
import { provideTiledMap } from "@rpgjs/tiledmap/client";
import { provideActionBattle } from "@rpgjs/action-battle/client";

export const configClient = {
  providers: [
    provideTiledMap({
      basePath: '/map',
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
    provideClientModules([
      { }
    ]),
  ],
};
