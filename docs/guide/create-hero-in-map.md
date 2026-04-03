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
    player.initializeDefaultStats();
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

It also initializes the built-in default stats so HP, SP, and parameters such as
`maxHp` are available immediately on the client.

## Initialize default stats only when needed

Use `player.initializeDefaultStats()` if you want RPGJS to define the default
parameter curves (`maxHp`, `maxSp`, `str`, `int`, `dex`, `agi`) and initialize
HP/SP from those values.

This is useful if:

- you define the starting stats directly in your game
- you rely on RPGJS built-in default values
- you want HP/SP and parameter displays to be ready on the client as soon as the game starts

Do not call `player.initializeDefaultStats()` after loading player data from:

- your own database
- a save slot
- a snapshot

In those cases, restore your saved data instead, otherwise you may overwrite the
existing values.

If you only need the built-in parameter curves without restoring HP/SP, use
`player.applyDefaultParameters()`.

## Use `onStart()` when the game begins after a GUI

If your game starts after a title screen or another GUI interaction, initialize the
default stats in `onStart()` instead of `onConnected()`.

`onStart()` is executed after a GUI interaction returns `data.id === 'start'`.

```ts
import { RpgPlayer, type RpgPlayerHooks } from "@rpgjs/server";

export const player: RpgPlayerHooks = {
  async onConnected(player: RpgPlayer) {
    await player.gui("rpg-title-screen").open();
  },

  onStart(player: RpgPlayer) {
    player.initializeDefaultStats();
    player.changeMap("simplemap", {
      x: 100,
      y: 100
    });
    player.name.set("YourName");
    player.setGraphic("hero");
  }
};
```

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
