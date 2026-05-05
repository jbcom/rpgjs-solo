import { LocalStorageSaveStorageStrategy, provideSaveStorage, provideServerModules } from "@rpgjs/server";
import { configCommon, studio } from "./config.common";
import { provideActionBattle } from "@rpgjs/action-battle/server";
import { createStudioActionBattleAnimations, provideStudioGame } from "@rpgjs/studio/server";

export const configServer = {
  providers: [
    ...configCommon.providers,
    provideStudioGame(studio),
    provideServerModules([]),
    provideSaveStorage(new LocalStorageSaveStorageStrategy({ key: "rpgjs-studio" })),
    provideActionBattle({
      animations: createStudioActionBattleAnimations(),
       attack: {
        lockMovement: true,
        lockDurationMs: 350
      }
    })
  ],
};
