---
title: "Authentication"
description: "Authenticate RPGJS players before they join MMORPG rooms."
---

# Authentication

Use the server engine `auth()` hook to authenticate a player before RPGJS lets the
WebSocket connection join a room.

In MMORPG mode, RPGJS connects to one room at a time. The first connection
usually targets `lobby-*`, then map changes reconnect the player to `map-*`
rooms. The `auth()` hook is called for each RPGJS room connection. If it throws,
the connection is refused before a `RpgPlayer` is created or restored in that
room.

## Mental model

Use `auth()` as the global RPGJS gate:

- it runs on the lobby connection;
- it runs again when the player reconnects to a map room;
- it accepts or refuses the room connection;
- it returns the stable public player id used by RPGJS and Signe user
  collections.

Use Signe guards for narrower authorization after authentication, such as
protecting an admin action, a custom room, or an HTTP endpoint.

## Server

Add `auth()` to the server engine hooks. Return the stable public player id for
the authenticated account.

```ts
import { RpgServerEngine, type RpgServerEngineHooks } from '@rpgjs/server'

const engine: RpgServerEngineHooks = {
    async auth(server: RpgServerEngine, socket: any) {
        const token = socket.handshake.query.token

        if (!token) {
            throw 'Authentication failed: No token provided'
        }

        const user = await verifyToken(token)
        return user.id
    }
}

export default {
    engine
}
```

The returned id becomes the Signe/RPGJS `publicId` used by `@users(RpgPlayer)`.
Return the same id for the same account on every room connection so the player
keeps the same identity when moving between maps.

If `auth()` returns `undefined`, RPGJS keeps the default behavior and lets the
room system generate the public player id.

### Public lobby, protected maps

If your lobby must stay public, return `undefined` for lobby rooms and only
enforce authentication on map rooms:

```ts
import { RpgServerEngine, type RpgServerEngineHooks } from '@rpgjs/server'

const engine: RpgServerEngineHooks = {
    async auth(server: RpgServerEngine, socket: any) {
        if (server.getCurrentRoomId()?.includes('lobby')) {
            return undefined
        }

        const token = socket.handshake.query.token

        if (!token) {
            throw 'Authentication failed: No token provided'
        }

        const user = await verifyToken(token)

        if (!user) {
            throw 'Authentication failed: Invalid token'
        }

        return user.id
    }
}
```

With this pattern, any client can enter the lobby, but a map connection is
refused unless `auth()` returns a valid stable player id.

## Client

In a browser, send credentials through the connection query. RPGJS sends this
query on the initial connection and again when the player reconnects to another
room.

```ts
import { provideMmorpg } from '@rpgjs/client'

export default [
    provideMmorpg({
        query: () => ({
            token: localStorage.getItem('token')
        })
    })
]
```

On map changes, RPGJS keeps its own session and transfer parameters and merges
your query into the reconnect request:

```txt
?id=<private-session-id>&token=<auth-token>&transferToken=<room-transfer-token>
```

Handle refused authentication with the client engine `onConnectError` hook:

```ts
import { type RpgClientEngineHooks } from '@rpgjs/client'

const engine: RpgClientEngineHooks = {
    onConnectError(engine, error) {
        console.error('Connection refused:', error)
        // Show your login screen, refresh the token, or redirect the player.
    }
}
```

When the server refuses the connection, the MMORPG client waits for the server
acceptance packet before starting the visual scene. This means an invalid token
does not enter a half-loaded map; `onConnectError` is the place to recover.
The client `onConnected` hook runs only after the server accepts the RPGJS
connection.

By default, the MMORPG client does not retry a connection that closes before
RPGJS accepts it. This avoids retry loops when a token is invalid. If you need
custom retry behavior, pass PartySocket options through `socketOptions`:

```ts
provideMmorpg({
    query: () => ({ token: localStorage.getItem('token') }),
    socketOptions: {
        maxRetries: 3
    }
})
```

## Guards

`auth()` is global RPGJS authentication. It decides whether the player may enter
the game and which public id represents the player.

Signe room guards are still useful for more specific authorization rules:

- protect a custom room;
- protect one action;
- protect an HTTP request handler;
- check roles or permissions after authentication.

For example, use `auth()` to identify the player, then use a Signe `@Guard()` to
restrict an admin action.
