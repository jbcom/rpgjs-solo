import { LocalStorageSaveStorageStrategy, provideSaveStorage, provideServerModules } from "@rpgjs/server";
import { configCommon } from "./config.common";
import { provideActionBattle } from "@rpgjs/action-battle/server";
import { provideStudioGame } from "@rpgjs/studio/server";

export const configServer = {
  providers: [
    ...configCommon.providers,
    provideStudioGame({
      projectId: '8398a00a-8a9b-41d5-aae3-77786643b790',
      apiBaseUrl: 'http://localhost:4200/api',
    }),
    provideServerModules([]),
    provideSaveStorage(new LocalStorageSaveStorageStrategy({ key: "rpgjs-studio" })),
    provideActionBattle()
  ],
};
