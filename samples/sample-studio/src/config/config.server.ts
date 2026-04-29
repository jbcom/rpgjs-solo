import { LocalStorageSaveStorageStrategy, provideSaveStorage, provideServerModules } from "@rpgjs/server";
import { configCommon, projectId } from "./config.common";
import { provideActionBattle } from "@rpgjs/action-battle/server";
import { createStudioActionBattleAnimations, provideStudioGame } from "@rpgjs/studio/server";

export const configServer = {
  providers: [
    ...configCommon.providers,
    provideStudioGame({
      projectId,
      baseUrl: 'http://localhost:5173',
      assetsUrl: 'http://localhost:5173/api/uploads',
    }),
    provideServerModules([]),
    provideSaveStorage(new LocalStorageSaveStorageStrategy({ key: "rpgjs-studio" })),
    provideActionBattle({
      animations: createStudioActionBattleAnimations(),
    })
  ],
};
