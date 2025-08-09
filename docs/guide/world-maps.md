---
title: World Maps API
---

## Map ↔ World attachment helpers

These helpers allow you to attach a map to a world, retrieve the attached world, and remove the map from the world.

### Get attached World

- Since: 3.0.0-beta.8
- Method: `map.getInWorldMaps()`
- Usage: Recover the world attached to this map (undefined if no world attached)

```ts
const world = map.getInWorldMaps();
if (world) {
  // use world manager
  console.log(world.getAllMaps());
}
```

### Remove this map from the world

- Since: 3.0.0-beta.8
- Method: `map.removeFromWorldMaps()`
- Return: `boolean | undefined`
- Usage: Remove this map from the world

```ts
const removed = map.removeFromWorldMaps();
// true if removed, false if not found, undefined if no world attached
```

### Assign the map to a world

- Since: 3.0.0-beta.8
- Method: `map.setInWorldMaps(worldMap)`
- Arguments: `{ RpgWorldMaps } worldMap` (Optional: false)
- Usage: Assign the map to a world

```ts
import { WorldMapsManager } from '@rpgjs/common';

const manager = new WorldMapsManager();
manager.configure([
  { id: 'town', worldX: 0, worldY: 0, width: 1024, height: 1024 },
]);

map.setInWorldMaps(manager);
```


