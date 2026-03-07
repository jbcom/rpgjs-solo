---
title: "Node server in production"
description: "Run RPGJS without Vite in production, secure map updates, and mount the transport in a Node HTTP server."
---

# Node server in production

`@rpgjs/server/node` lets you run the RPGJS server runtime without Vite.

Use it when you want to mount the server in your own Node stack:

- Express
- Fastify
- Hono on Node
- a custom `http.createServer()` setup

## Dev vs production

In development with `@rpgjs/vite`, map rooms are initialized automatically by the Vite plugin.

In production, map updates must come from a trusted backend source. To protect `/map/update`, set `RPGJS_MAP_UPDATE_TOKEN`.

When this environment variable is set:

- gameplay clients cannot update maps
- trusted backend code must send the token
- you can use `transport.updateMap()` or call the HTTP endpoint yourself

## 1. Create the transport

```ts
import http from "node:http"
import express from "express"
import { WebSocketServer } from "ws"
import { createRpgServerTransport } from "@rpgjs/server/node"
import ServerModule from "./server"

const app = express()
const server = http.createServer(app)
const wsServer = new WebSocketServer({ noServer: true })

const transport = createRpgServerTransport(ServerModule, {
  initializeMaps: false,
  mapUpdateToken: process.env.RPGJS_MAP_UPDATE_TOKEN,
})

app.use("/parties", (req, res, next) => {
  void transport.handleNodeRequest(req, res, next, {
    mountedPath: "/parties",
  })
})

server.on("upgrade", (request, socket, head) => {
  void transport.handleUpgrade(wsServer, request, socket, head)
})

server.listen(3000)
```

## 2. Push trusted map updates

If your map data is produced inside the same trusted Node process, use `transport.updateMap()`.

```ts
await transport.updateMap("town", {
  id: "town",
  width: 3200,
  height: 2400,
  events: [],
  data: tiledXml,
})
```

`transport.updateMap("town", ...)` targets the room `map-town` automatically.

## 3. Call `/map/update` from another trusted backend

If your editor pipeline, admin API, or deploy step runs outside the game server process, call the endpoint directly with the token.

Endpoint format:

```txt
POST /parties/main/map-<mapId>/map/update
```

Example:

```ts
import { createMapUpdateHeaders } from "@rpgjs/server/node"

await fetch("http://localhost:3000/parties/main/map-town/map/update", {
  method: "POST",
  headers: createMapUpdateHeaders(process.env.RPGJS_MAP_UPDATE_TOKEN),
  body: JSON.stringify({
    id: "town",
    width: 3200,
    height: 2400,
    events: [],
    data: tiledXml,
  }),
})
```

You can also send the token as:

- `x-rpgjs-map-update-token: <token>`
- `Authorization: Bearer <token>`

## Recommended production flow

1. Start your Node server with `RPGJS_MAP_UPDATE_TOKEN` set.
2. Mount `transport.handleNodeRequest()` and `transport.handleUpgrade()`.
3. Keep `initializeMaps: false` in production.
4. From a trusted backend source, call `transport.updateMap()` or `POST /parties/main/map-<id>/map/update`.
5. Let gameplay clients use only normal movement and game actions.

## Hono and other runtimes

The same transport can be used outside Express:

- use `transport.fetch()` when your framework exposes Fetch `Request`/`Response`
- use `transport.handleNodeRequest()` when your framework gives Node `req`/`res`
- use `transport.acceptWebSocket()` or `transport.handleUpgrade()` for WebSocket upgrades

## Security note

Do not expose `/map/update` without a token in public MMORPG production deployments.

`/map/update` is a trusted server-side operation. It can redefine map geometry, events, and world metadata.

## Development with Vite

With `@rpgjs/vite`, you do not need this manual flow for local development.

The Vite plugin creates the transport internally and performs the server-side map bootstrap automatically.
