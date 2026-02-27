---
title: "Client Physics Hooks"
description: "Guide for Client Physics Hooks in RPGJS."
---

# Client Physics Hooks

Client physics hooks let you extend client-side physics (including client prediction) from `sceneMap`.

Use these hooks to keep collision rules aligned with the server.

## Usage

```ts
import { defineModule, type RpgClient } from "@rpgjs/client";

export default defineModule<RpgClient>({
  sceneMap: {
    onPhysicsInit(scene, { mapData }) {
      // Build physics metadata from mapData
    },
    onPhysicsEntityAdd(scene, { owner, entity, kind }) {
      // Attach entity-level rules (ex: canEnterTile)
    },
    onPhysicsEntityRemove(scene, { owner }) {
      // Cleanup entity-level rules
    },
    onPhysicsReset(scene) {
      // Cleanup all physics extension state
    },
  },
});
```

## Available Hooks

### `onPhysicsInit(scene, context)`

Called when map physics is initialized.

- `scene`: current `RpgClientMap`
- `context.mapData`: map data used by `loadPhysic()`

Use this to precompute shared collision metadata from map data.

### `onPhysicsEntityAdd(scene, context)`

Called when a dynamic physics body is created.

- `context.owner`: player/event owning the body
- `context.entity`: physics entity instance
- `context.kind`: `"hero" | "npc" | "generic"`

Use this to attach rules such as `entity.canEnterTile(...)`.

### `onPhysicsEntityRemove(scene, context)`

Called before a dynamic physics body is removed.

Use this to unregister handlers created in `onPhysicsEntityAdd`.

### `onPhysicsReset(scene)`

Called when the physics world is reset before reloading map physics.

Use this to clear global state and remaining subscriptions.

## Best Practices

- Keep handlers deterministic and synchronous when possible.
- Use the same shared rule functions on client and server.
- Prefer hook-based setup over `setTimeout()` for physics extensions.
