import { LocalStorageSaveStorageStrategy, provideSaveStorage, provideServerModules } from "@rpgjs/server";
import { configCommon } from "./config.common";
import { provideActionBattle } from "@rpgjs/action-battle/server";
import { provideStudioGame } from "@rpgjs/studio/server";

export const configServer = {
  providers: [
    ...configCommon.providers,
    provideStudioGame({
      projectId: '04424a49-79d4-4933-b869-077278e430f9',
      baseUrl: 'http://localhost:5173',
      assetsUrl: 'http://localhost:5173/api/uploads',
    }),
    provideServerModules([]),
    provideSaveStorage(new LocalStorageSaveStorageStrategy({ key: "rpgjs-studio" })),
    provideActionBattle()
  ],
};
