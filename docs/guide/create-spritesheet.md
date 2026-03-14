---
title: "Create spritesheet"
description: "Register your first character spritesheet in RPGJS."
---

# Create spritesheet

Spritesheets are registered on the client side.

## Basic setup

Add your first spritesheet in `config/config.client.ts`:

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

## File location

Place the image where the client can load it, for example:

```text
public/spritesheets/hero.png
```

## Use the spritesheet

Once registered, you can assign it from the server:

```ts
player.setGraphic("hero");
```

## Recommended flow

1. Create the image file
2. Register it in `config.client.ts`
3. Use `player.setGraphic("hero")`
4. Test it in your first map

## More options

For advanced spritesheet setup, dynamic resolution, and presets, see [Spritesheets Guide](/guide/spritesheets).

## Next step

Continue with [Create a world](/guide/create-world).

