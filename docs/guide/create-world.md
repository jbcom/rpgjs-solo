---
title: "Create a world"
description: "Connect several maps together inside a world."
---

# Create a world

A world links several maps together with world coordinates.

Use this when you want map-to-map transitions, overworld navigation, or a large connected game world.

## Declare world maps in a module

You can register a world directly with `provideServerModules`:

```ts
import { provideServerModules } from "@rpgjs/server";

provideServerModules([
  {
    worldMaps: [
      {
        id: "main-world",
        maps: [
          { id: "town", worldX: 0, worldY: 0, width: 800, height: 600 },
          { id: "forest", worldX: 800, worldY: 0, width: 800, height: 600 }
        ]
      }
    ]
  }
]);
```

## Create or update a world dynamically

You can also do it from the server map API:

```ts
const manager = map.createDynamicWorldMaps({
  id: "main-world",
  maps: [
    { id: "town", worldX: 0, worldY: 0, width: 800, height: 600 },
    { id: "forest", worldX: 800, worldY: 0, width: 800, height: 600 }
  ]
});
```

Or update it later:

```ts
await map.updateWorldMaps("main-world", [
  { id: "town", worldX: 0, worldY: 0, width: 800, height: 600 },
  { id: "forest", worldX: 800, worldY: 0, width: 800, height: 600 }
]);
```

## Keep this page focused on creation

This page covers the creation workflow only.

For the full runtime API, see [Map API / World Maps](/api/map/world-maps).

## Next step

Continue with [Create an event](/guide/create-event).

