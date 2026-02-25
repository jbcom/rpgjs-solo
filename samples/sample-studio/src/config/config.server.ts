import { LocalStorageSaveStorageStrategy, provideSaveStorage, provideServerModules } from "@rpgjs/server";
import modules from "../modules";
import { configCommon } from "./config.common";
import { provideTiledMap } from "@rpgjs/tiledmap/server";
import { provideActionBattle } from "@rpgjs/action-battle/server";

export const configServer = {
  providers: [
    ...configCommon.providers,
    provideServerModules(modules),
    provideSaveStorage(new LocalStorageSaveStorageStrategy({ key: "rpgjs-studio" })),
    provideActionBattle()
     //  provideTiledMap(),
  ],
};
