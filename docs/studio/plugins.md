---
title: "Create a Studio plugin"
description: "Extend the RPGJS Studio map renderer with Studio plugins."
---

# Create a Studio plugin

Studio plugins extend the Studio map renderer without replacing the map component. Use them for client-side Studio tools such as debug overlays, editor helpers, visual diagnostics, or custom map rendering aids.

Studio plugins are client-side rendering extensions. They do not create gameplay authority and they do not replace server-side map, event, or collision logic.

## Built-in debug plugin

The simplest way to display Studio collision overlays is the compatibility shortcut:

```ts
import { provideStudioGame } from "@rpgjs/studio";

provideStudioGame({
  projectId: "your-project-id",
  debugCollisions: true,
});
```

This enables the built-in debug collisions plugin.

For events, the red overlay is drawn on the RPGJS collision hitbox. Studio reads
the physics body top-left position when it is available, then uses the event
`hitbox()` width and height. This can differ from the visible sprite bounds when
the sprite is larger than its collision box.

Player hitboxes are displayed by default with the same overlay. Set
`players: false` to hide the player collision box while keeping event collision
boxes visible.

You can also attach it explicitly:

```ts
import {
  provideStudioGame,
  studioDebugCollisionsPlugin,
} from "@rpgjs/studio";

provideStudioGame({
  projectId: "your-project-id",
  studioPlugins: [
    studioDebugCollisionsPlugin(),
  ],
});
```

The plugin can be configured:

```ts
import {
  provideStudioGame,
  studioDebugCollisionsPlugin,
} from "@rpgjs/studio";

provideStudioGame({
  projectId: "your-project-id",
  studioPlugins: [
    studioDebugCollisionsPlugin({
      terrain: true,
      elements: true,
      events: true,
      players: true,
      color: 0xef4444,
      fillAlpha: 0.18,
      strokeAlpha: 0.72,
    }),
  ],
});
```

## Create a plugin

A Studio plugin is an object with an `id` and optional renderer hooks.

```ts
import type { StudioMapPlugin } from "@rpgjs/studio";

export function myStudioPlugin(): StudioMapPlugin {
  return {
    id: "my-studio-plugin",

    terrainOptions(ctx) {
      return {};
    },

    elementRenderOptions(ctx) {
      return {};
    },

    eventLayerPixiChildren(ctx) {
      return [];
    },
  };
}
```

Attach it with `studioPlugins`:

```ts
import { provideStudioGame } from "@rpgjs/studio";
import { myStudioPlugin } from "./my-studio-plugin";

provideStudioGame({
  projectId: "your-project-id",
  studioPlugins: [
    myStudioPlugin(),
  ],
});
```

## Renderer hooks

Use `terrainOptions(ctx)` to add options to the Studio terrain renderer:

```ts
import type { StudioMapPlugin } from "@rpgjs/studio";

export function terrainToolPlugin(): StudioMapPlugin {
  return {
    id: "terrain-tool",
    terrainOptions() {
      return {
        debugCollisions: true,
      };
    },
  };
}
```

Use `elementRenderOptions(ctx)` to add options to Studio element rendering:

```ts
import type { StudioMapPlugin } from "@rpgjs/studio";

export function elementToolPlugin(): StudioMapPlugin {
  return {
    id: "element-tool",
    elementRenderOptions() {
      return {
        debugCollisions: true,
      };
    },
  };
}
```

Use `eventLayerPixiChildren(ctx)` to add Pixi objects to the event layer. The returned objects are mounted next to Studio events, players, low elements, and wall occlusion sprites.

```ts
import type { StudioMapPlugin } from "@rpgjs/studio";
import { Graphics } from "pixi.js";

export function eventOverlayPlugin(): StudioMapPlugin {
  const overlay = new Graphics() as any;
  overlay.label = "MyStudioOverlay";
  overlay.zIndex = 2147483647;

  overlay.__studioMapPluginUpdate = () => {
    overlay.clear();
    overlay
      .rect(0, 0, 96, 48)
      .fill({ color: 0x22c55e, alpha: 0.18 });
  };

  return {
    id: "event-overlay",
    eventLayerPixiChildren() {
      return [overlay];
    },
  };
}
```

If a Pixi child defines `__studioMapPluginUpdate`, Studio calls it every frame while the child is mounted.

## Plugin context

Each hook receives:

```ts
type StudioMapPluginContext = {
  engine: RpgClientEngine;
  map: any;
  data: any;
};
```

- `engine`: the active client engine.
- `map` and `data`: the current Studio map render data.

Use the context for rendering decisions only. Server-owned gameplay state should still be changed through RPGJS server APIs, map events, and synchronized data.
