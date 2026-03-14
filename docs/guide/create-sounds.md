---
title: "Create sounds"
description: "Register sounds on the client and play them from gameplay code."
---

# Create sounds

Sounds are declared on the client, then triggered from the client or the server.

## Register sounds on the client

```ts
import { provideClientModules } from "@rpgjs/client";

provideClientModules([
  {
    sounds: [
      {
        id: "item-pickup",
        src: "sounds/item-pickup.mp3"
      },
      {
        id: "battle-theme",
        src: "sounds/battle-theme.mp3"
      }
    ]
  }
]);
```

## Play a sound for one player

```ts
player.playSound("item-pickup");
```

## Play a sound for the whole map

```ts
map.playSound("battle-theme", {
  volume: 0.8,
  loop: true
});
```

## Add map ambience

Maps can automatically play sounds when the player joins:

```ts
provideServerModules([
  {
    maps: [
      {
        id: "town",
        sounds: ["town-bgm", "town-ambience"]
      }
    ]
  }
]);
```

## More details

See [Sounds Guide](/guide/sounds) for dynamic sound loading, stop strategies, and full audio examples.

