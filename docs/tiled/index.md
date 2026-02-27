---
title: "Using TiledMap with RPG-JS"
description: "Guide for Using TiledMap with RPG-JS in RPGJS."
---

# Using TiledMap with RPG-JS

TiledMap integration allows you to use maps created with the [Tiled Map Editor](https://www.mapeditor.org/) in your RPG-JS games. This provides a visual way to design your game maps with layers, tilesets, collision detection, and interactive objects.

## Installation

First, install the TiledMap package:

```bash
npm install @rpgjs/tiledmap
```

## Vite Configuration

Configure your `vite.config.ts` to handle Tiled map files:

```ts
import { defineConfig } from 'vite';
import { tiledMapFolderPlugin } from '@rpgjs/vite';

export default defineConfig({
  plugins: [
    tiledMapFolderPlugin({
      sourceFolder: './src/tiled',      // Folder containing your TMX files
      publicPath: '/map',               // Public URL path for maps
      buildOutputPath: 'assets/data'    // Build output directory
    })
  ]
});
```

### Plugin Options

- **`sourceFolder`**: Directory containing your TMX files, TSX tilesets, and images
- **`publicPath`**: URL path prefix for accessing map files (default: `/data`)
- **`buildOutputPath`**: Target folder in build output (default: `assets/data`)
- **`allowedExtensions`**: File extensions to include (default: `['.tmx', '.tsx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']`)

## Client-Side Setup

Configure the client to use TiledMap:

```ts
import { mergeConfig } from "@signe/di";
import { provideClientGlobalConfig, provideRpg, startGame } from "@rpgjs/client";
import { provideTiledMap } from "@rpgjs/tiledmap/client";
import startServer from "./server";

startGame(
  mergeConfig({
    providers: [
      provideTiledMap({
        basePath: "map"  // Must match publicPath in vite.config.ts
      }),
      provideClientGlobalConfig(),
      // ... other client providers
    ]
  }, {
    providers: [provideRpg(startServer)]
  })
);
```

## Server-Side Setup

Configure the server to use TiledMap:

```ts
import { createServer, provideServerModules } from "@rpgjs/server";
import { provideTiledMap } from "@rpgjs/tiledmap/server";

export default createServer({
  providers: [
    provideTiledMap(),  // No options needed for server
    provideServerModules([
      {
        maps: [
          {
            id: "mymap",  // Map ID (should match TMX filename)
            // ... other map configuration
          }
        ]
      }
    ])
  ]
});
```

## File Structure

Organize your Tiled files in the configured source folder:

```
src/
├── tiled/
│   ├── mymap.tmx          # Your Tiled map file
│   ├── tileset.tsx        # Tileset definition
│   ├── tiles.png          # Tileset image
│   └── objects.png        # Object sprites
└── ...
```

## Features

### Automatic Collision Detection

TiledMap automatically detects collision tiles and applies tile rules to physics:

- Set the `collision` property to `true` on tiles in Tiled Map Editor
- Collision rules are attached to entities through physics extension hooks
- The same collision logic is used on server authority and client prediction
- No additional code required for basic tile blocking

### Event Integration

Place events in Tiled using point objects:

1. Create an Object Layer in Tiled
2. Add Point objects with names matching your event names
3. Events will be automatically positioned based on object coordinates

```ts
// In your server configuration
{
  maps: [
    {
      id: "mymap",
      events: [MyEvent()] // Event will be positioned from Tiled object
    }
  ]
}
```

## Physics Hooks Integration

The tiled module now uses shared physics hooks:

- Server: `map.onPhysicsInit`, `map.onPhysicsEntityAdd`, `map.onPhysicsEntityRemove`, `map.onPhysicsReset`
- Client: `sceneMap.onPhysicsInit`, `sceneMap.onPhysicsEntityAdd`, `sceneMap.onPhysicsEntityRemove`, `sceneMap.onPhysicsReset`

This gives consistent tile collision behavior for both client prediction and server validation.
