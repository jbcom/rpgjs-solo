---
title: "Create hero in map"
description: "Spawn the player in a map and assign the first hero graphic."
---

# Create hero in map

Once your first map exists, the next step is to put the player inside it and assign a spritesheet.

## Spawn the player on connection

In your player hooks:

```ts
import { RpgPlayer, type RpgPlayerHooks } from "@rpgjs/server";

export const player: RpgPlayerHooks = {
  onConnected(player: RpgPlayer) {
    player.changeMap("simplemap", {
      x: 100,
      y: 100
    });
    player.name.set("YourName");
    player.setGraphic("hero");
  }
};
```

This does three things:

1. Sends the player to `simplemap`
2. Places the player at the given coordinates
3. Uses the `hero` spritesheet on the client

## Make sure the `hero` graphic exists

The `hero` identifier must exist in your client configuration:

```ts
import { provideClientModules, Presets } from "@rpgjs/client";

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
]);
```

## Open the main menu on input

You can also add simple input behavior directly in the same hook:

```ts
onInput(player, { action }) {
  if (action == "escape") {
    player.callMainMenu();
  }
}
```

## Next step

Continue with [Create spritesheet](/guide/create-spritesheet).

