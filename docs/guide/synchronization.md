# Synchronization between Server and Client

In RPGJS, synchronization between the server and the client is a crucial aspect to ensure a consistent and immersive gameplay experience. This readme will guide you through the process of synchronizing data between the server and the client, utilizing schemas and hooks provided by RPGJS.

## Understanding RPGJS Schemas and Data Synchronization

RPGJS uses schemas to define the structure of data that needs to be synchronized between the server and the client. These schemas ensure that the properties of entities, such as players and items, are consistent and correctly communicated between the server and the client. Properties are implemented as signals, which provide reactivity - when a property changes using the `.set()` method, it is automatically sent to the client, keeping the game state up-to-date.

Schemas work within the context of a "room" in RPGJS, where a room is essentially a map in the game world. It's important to note that when a player changes maps, synchronization can be lost if not handled properly.

## Best Practices for Synchronization

### Avoid Synchronization Issues After Changing Maps\*\*

When a player changes maps, it's crucial not to continue executing the code in the `onConnected` method immediately. This is because the properties might not be synchronized with the client yet. Instead, use the `onJoinMap` hook to ensure synchronization before performing any actions.

```typescript
import { RpgPlayer, RpgPlayerHooks } from "@rpgjs/server";

export const player: RpgPlayerHooks = {
  async onConnected(player: RpgPlayer) {
    player.hitbox(32, 16);
    player.setGraphic("hero");
    await player.changeMap("medieval", {
      x: 100,
      y: 100,
    });
  },
  // Synchronization is ensured in this hook
  onJoinMap(player: RpgPlayer) {
    player.hp = 500;
  },
};
```

### Custom Synchronization with Schemas\*\*

You can also create custom synchronization by extending existing schemas or defining new ones.

Example:

```typescript
import { RpgPlayerHooks, RpgPlayer } from "@rpgjs/server";
import { signal, type Signal } from "@signe/reactive";

declare module "@rpgjs/server" {
  export interface RpgPlayer {
    wood: Signal<number>;
  }
}

export const player: RpgPlayerHooks = {
  props: {
    wood: Number, // Add the custom property
  },
  onConnected(player: RpgPlayer) {
    player.wood.set(0); // Initialize the custom property using signal
  },
};
```

With these steps, you've successfully added a custom property named `wood` to the player entity and ensured its synchronization with the client. The use of signals (`.set()` method) enables reactivity, which is essential for automatic synchronization. Any changes you make to this property will be automatically sent to the client, maintaining a consistent game state for all players.

::: tip Save Custom Props
In addition to synchronization, RPGJS provides a mechanism to save snapshots of player data, including custom properties, to databases.

```ts
import { RpgPlayerHooks, RpgPlayer } from "@rpgjs/server";
import { signal, type Signal } from "@signe/reactive";

declare module "@rpgjs/server" {
  export interface RpgPlayer {
    wood: Signal<number>;
  }
}

export const player: RpgPlayerHooks = {
  props: {
    wood: Number,
  },
  onConnected(player: RpgPlayer) {
    player.wood.set(0);
  },
  async onDisconnect(player: RpgPlayer) {
    // Save the player data, including custom properties, to the database
    const json = await player.save();
    console.log(json); // --> { ..., "wood": 0 }
  },
};
```

:::

::: tip Save Custom Props but not synchronized with the client

```ts
import { RpgPlayerHooks, RpgPlayer } from "@rpgjs/server";
import { signal, type Signal } from "@signe/reactive";

declare module "@rpgjs/server" {
  export interface RpgPlayer {
    secret: Signal<string>;
  }
}

export const player: RpgPlayerHooks = {
  props: {
    secret: {
      $syncWithClient: false,
    },
  },
  onConnected(player: RpgPlayer) {
    player.secret.set("mysecretvalue");
    const json = await player.save();
    console.log(json); // --> { ..., "secret": "mysecretvalue" }
  },
};
```

The custom property `secret` could be used for various purposes in your game. It might hold sensitive information that shouldn't be shared with the client, such as a player's authentication token, API keys, or any other private data.

By configuring the property with `$syncWithClient: false`, you can control what data is sent to the client and what remains hidden on the server. This enables you to strike a balance between synchronization and data security.
:::

::: tip Synchronize with client but do not register

```ts
import { RpgPlayerHooks, RpgPlayer } from "@rpgjs/server";
import { signal, type Signal } from "@signe/reactive";

declare module "@rpgjs/server" {
  export interface RpgPlayer {
    message: Signal<string>;
  }
}

export const player: RpgPlayerHooks = {
  props: {
    message: {
      $permanent: false,
    },
  },
  async onConnected(player: RpgPlayer) {
    player.message.set("custom message");
    const json = await player.save();
    console.log(json); // --> { ... } // does not include the message property
  },
};
```

The `$permanent` configuration allows you to control whether a custom property should be persisted and stored as part of the player's data or not. This can be useful for temporary properties, session-specific information, or data that doesn't need to be preserved beyond the current session.

For instance, you might use the non-permanent property to temporarily store a player's chat message before sending it to other players or logging it for debugging purposes. Since the property is not saved permanently, it won't clutter the saved data with transient information.
:::

## Retrieving Synchronization on Client Side

Once you have set up synchronization on the server side, you need to retrieve and use this synchronized data on the client side.

### Using the onInit Hook for Sprites

The `onInit` hook is called when a sprite instance is created, but before the component is displayed. This is the perfect place to access synchronized properties and set up reactive data.

```typescript
import { provideClientModules } from "@rpgjs/client";
import { signal, effect } from "canvasengine";

export default {
  providers: [
    provideClientModules([
      {
        sprite: {
          onInit: (sprite) => {
            sprite.wood = signal(0);
            effect(() => {
              console.log("Player wood:", sprite.wood());
            });
          },
        },
      },
    ]),
  ],
};
```
