import {
  provideClientGlobalConfig,
  provideClientModules,
  provideMmorpg,
  startGame,
} from "@rpgjs/client";
import { provideTiledMap } from "@rpgjs/tiledmap/client";

startGame({
  providers: [
    provideTiledMap({ basePath: "map" }),
    provideClientGlobalConfig(),
    provideClientModules([]),
    provideMmorpg({ connectionIdScope: "session" }),
  ],
});
