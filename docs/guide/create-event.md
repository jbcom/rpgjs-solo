---
title: "Create an event"
description: "Create your first NPC or interactive event."
---

# Create an event

An event is any interactive object on the map: an NPC, a chest, a switch, an enemy, or a trigger.

## Create a simple event

You can define an event as an object with hooks:

```ts
import { RpgPlayer } from "@rpgjs/server";

export function ChestEvent() {
  return {
    id: "chest-1",
    x: 200,
    y: 120,
    onInit() {
      this.setGraphic("chest");
    },
    async onAction(player: RpgPlayer) {
      await player.showText("You found a potion.");
    }
  };
}
```

## Attach the event to a map

Register it in your server module:

```ts
import { defineModule } from "@rpgjs/common";
import { RpgServer } from "@rpgjs/server";
import { ChestEvent } from "./events/chest";

export default defineModule<RpgServer>({
  maps: [
    {
      id: "simplemap",
      events: [ChestEvent()]
    }
  ]
});
```

## Event hooks you will use first

- `onInit()` to configure the event
- `onAction(player)` when the player interacts
- `onPlayerTouch(player)` when the player touches the event

## Shared or scenario

When building an MMORPG, choose the right mode:

- use shared for global world state
- use scenario for per-player progression

See [Event modes](/guide/event-modes) for the full behavior.

## Next step

Continue with [Create database](/guide/create-database).

