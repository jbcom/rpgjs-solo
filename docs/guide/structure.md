---
title: "Structure"
description: "Understand the default RPGJS project structure."
---

# Structure

The starter separates client boot, server boot, shared client config, and modules.

## `client.ts`

`client.ts` starts the browser client in MMORPG mode:

```ts
import { startGame, provideMmorpg } from "@rpgjs/client";
import configClient from "./config/config.client";
import { mergeConfig } from "@signe/di";

startGame(
  mergeConfig(configClient, {
    providers: [provideMmorpg({})],
  }) 
);
```

Use this entry when the client connects to a remote RPGJS server.

## `server.ts`

`server.ts` creates the game server and registers your providers:

```ts
import { createServer, provideServerModules, LocalStorageSaveStorageStrategy } from "@rpgjs/server";
import { provideMain } from "./modules/main";
import { provideSaveStorage } from "@rpgjs/server";
import { provideTiledMap } from "@rpgjs/tiledmap/server";

export default createServer({
  providers: [
    provideMain(),
    provideSaveStorage(new LocalStorageSaveStorageStrategy({ key: "save" })),
    provideServerModules([]),
    provideTiledMap()
  ]
});
```

This is where you plug modules, maps, database content, save strategies, or server adapters.

## `standalone.ts`

`standalone.ts` runs the client and server together for a standalone RPG:

```ts
import { mergeConfig } from "@signe/di";
import { provideRpg, startGame } from "@rpgjs/client";
import startServer from "./server";
import configClient from "./config/config.client";

startGame(
  mergeConfig(configClient, {
    providers: [provideRpg(startServer)],
  })
);
```

Use this entry when you want a single-player RPG running entirely from the client app.

## `config/config.client.ts`

`config.client.ts` contains the common client setup shared by MMORPG and standalone RPG:

```ts
import { provideClientGlobalConfig, provideClientModules, Presets } from "@rpgjs/client";
import { provideMain } from "../modules/main";
import { provideTiledMap } from "@rpgjs/tiledmap/client";

export default {
  providers: [
    provideTiledMap({
      basePath: "map",
    }),
    provideClientGlobalConfig(),
    provideMain(),
    provideClientModules([
      {
        spritesheets: [
          {
            id: "hero",
            image: "spritesheets/hero.png",
            ...Presets.RMSpritesheet(3, 4)
          }
        ]
      }
    ])
  ],
};
```

Put here everything the client always needs: map loading, global config, modules, spritesheets, sounds, and resolvers.

## `modules/main`

The main module is usually where you declare your first server hooks and maps:

```ts
import { createModule } from "@rpgjs/common";
import server from "./server";

export function provideMain() {
  return createModule("main", [{
    server
  }]);
}
```

This keeps your game logic modular. You can add more modules later for battle, UI, quests, chat, or any custom feature.
