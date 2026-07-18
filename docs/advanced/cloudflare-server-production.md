---
title: "Cloudflare server in production"
description: "Run an authoritative RPGJS MMORPG with Signe rooms and Cloudflare Durable Objects."
---

# Cloudflare server in production

`@rpgjs/server/cloudflare` runs the same framework-agnostic server module as the
Node adapter. Each Signe namespace and room id is routed deterministically to a
Durable Object. WebSocket metadata and synchronized room state survive object
hibernation and re-instantiation.

## Worker entry

```ts
import {
  RpgServerDurableObject,
  createRpgServerWorker,
} from "@rpgjs/server/cloudflare";
import ServerModule from "./server";

export { RpgServerDurableObject };

const rooms = createRpgServerWorker(ServerModule, {
  binding: "RPGJS_ROOMS",
  partiesPath: "/parties/main",
});

export default {
  fetch(request, env, ctx) {
    return rooms.fetch(request, env, ctx);
  },
};
```

Configure `RPGJS_ROOMS` as a SQLite Durable Object class in `wrangler.jsonc` and
export `RpgServerDurableObject` from the Worker entry. Use a recent compatibility
date and generate bindings with `wrangler types`.

## Maps are published externally

The Worker does not read TMX files from a filesystem and the browser client is
not trusted to configure the authoritative map. Before players enter a map, an
editor, Vite development server, CI job, or administrative backend sends:

```txt
POST /parties/main/map-<id>/map/update
x-rpgjs-map-update-token: <secret>
```

The payload owns the complete authoritative definition: parsed map data,
dimensions, map configuration, events, world metadata, and damage formulas.
Set the Worker secret interactively:

```bash
wrangler secret put RPGJS_MAP_UPDATE_TOKEN
```

`createRpgServerWorker()` fails closed for map updates when this secret is
missing. A map room can be created by the trusted update before its first player
connects. RPGJS awaits a private source write to Durable Object storage before
acknowledging the update. If the object hibernates between publication and the
first WebSocket, the new room instance restores that source and rebuilds its
transient chunks, physics, and events before answering the client's stream
request.

## Local Vite and Wrangler workflow

Configure the Vite plugin with a remote development server:

```ts
rpgjs({
  server: ServerModule,
  devServer: {
    target: "http://127.0.0.1:8787",
    mapIds: ["town"],
    mapUpdateToken: process.env.RPGJS_MAP_UPDATE_TOKEN,
  },
});
```

Vite proxies HTTP and WebSocket traffic under `/parties` to Wrangler. It uses a
server-only publisher to send the configured maps on startup and after HMR.
See `samples/cloudflare-mmorpg` for the complete setup.

For sources that need asynchronous preparation, use `resolveMapPayload`. This is
particularly important for Studio because the publisher must fetch and normalize
the complete v2 map before the room compiles its private authoritative state and
public chunks:

```ts
import { createStudioMapUpdatePayload } from "@rpgjs/studio/server";

rpgjs({
  server: ServerModule,
  devServer: {
    target: "http://127.0.0.1:8787",
    mapIds: ["studio-map-id"],
    mapUpdateToken: process.env.RPGJS_MAP_UPDATE_TOKEN,
    resolveMapPayload: ({ mapId }) =>
      createStudioMapUpdatePayload(mapId, {
        projectId: "studio-project-id",
        startMapId: mapId,
      }),
  },
});
```

The callback runs in Vite's Node process, not in the browser. Do not use a
`VITE_`-prefixed secret. The browser receives only nearby render and physics
chunks; event rules, project data, the database, and the complete collision model
remain in the Durable Object. Renderable media URLs remain public.

The Studio playground contains a local Wrangler entry, integration test, fixture,
and authenticated seed command:

```bash
cd playground/games/studio
cp .env.example .env.local
cp .dev.vars.example .dev.vars
pnpm dev:cloudflare
pnpm seed:cloudflare
```

`RPG_TYPE=mmorpg` alone keeps the normal Node.js room hosted by Vite and does
not require `RPGJS_MAP_UPDATE_TOKEN`. The playground's `dev:cloudflare` and
`build:cloudflare` scripts additionally set `RPGJS_SERVER_ADAPTER=cloudflare`;
only that adapter enables remote publication and requires the shared secret.

It also documents the equivalent `curl` request and how to publish a real Studio
project and map. Studio MMORPG streaming accepts v2 maps; v1 maps remain available
to the standalone loader.

## Empty maps

When the final connection leaves a map, RPGJS stops its 60 Hz simulation loop.
Persisted state remains in the Durable Object. On the next connection, RPGJS
restores the state and rebuilds transient physics and event resources without
simulating elapsed empty-room time.
