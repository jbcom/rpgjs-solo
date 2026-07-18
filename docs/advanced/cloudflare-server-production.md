---
title: "Cloudflare server in production"
description: "Run an authoritative RPGJS MMORPG with Signe rooms and Cloudflare Durable Objects."
---

# Cloudflare server in production

`@rpgjs/server/cloudflare` runs the same framework-agnostic server module as the
Node adapter. Each Signe namespace and room id is routed deterministically to a
Durable Object. WebSockets remain attached during hibernation, while persisted
room state lets RPGJS rebuild a new in-memory instance when the object wakes.

## Mental model

The Worker is the public HTTP and WebSocket entry point. It routes each RPGJS
room id to one deterministic Durable Object:

```txt
Worker /parties/main
  ├─ lobby-1   → one Durable Object
  ├─ map-port  → one Durable Object
  └─ map-marsh → one Durable Object
```

Players connected to the same room share the same authoritative simulation.
Different map rooms do not share in-memory state, which is why world topology
updates must be sent to every affected map room.

RPGJS uses Cloudflare's hibernatable WebSocket path. While a room is idle,
Cloudflare can remove its JavaScript instance from memory without disconnecting
its WebSockets. In-memory physics, chunks, events, and world managers are then
lost. RPGJS persists the authoritative map source and world topology first, and
rebuilds those transient resources when the Durable Object starts again. Do not
treat class properties as durable storage. See Cloudflare's
[WebSocket hibernation lifecycle](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
for the underlying runtime behavior.

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
export `RpgServerDurableObject` from the Worker entry:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-rpgjs-game",
  "main": "src/entries/cloudflare.ts",
  "compatibility_date": "2026-07-18",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [
      {
        "name": "RPGJS_ROOMS",
        "class_name": "RpgServerDurableObject"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["RpgServerDurableObject"]
    }
  ]
}
```

Use a recent compatibility date and generate bindings with `wrangler types`.
Keep the existing migration tags after deployment; add a new migration rather
than rewriting an already deployed one. Cloudflare documents the available
[Durable Object migration operations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/).

## Maps and worlds are published externally

The Worker does not read project files from a filesystem and the browser client
is not trusted to configure authoritative maps. An editor, Vite development
server, CI job, or administrative backend publishes them with the following
server-only flow:

```txt
trusted publisher
  ├─ POST /parties/main/map-<updated-map>/map/update
  └─ POST /parties/main/map-<each-world-map>/world/<world-id>/update
```

The endpoints have different responsibilities:

| Endpoint | Responsibility |
| --- | --- |
| `POST /parties/main/map-<id>/map/update` | Replace one authoritative map revision, including its events, collisions, streaming data, and dimensions. |
| `POST /parties/main/map-<id>/world/<world-id>/update` | Replace the world topology used by that map room for automatic map transitions. |

Both endpoints accept the same administration token:

```txt
x-rpgjs-map-update-token: <secret>
```

Set the Worker secret interactively:

```bash
wrangler secret put RPGJS_MAP_UPDATE_TOKEN
```

`createRpgServerWorker()` fails closed for map and world updates when this secret
is missing. A map room can be created by a trusted update before its first player
connects. RPGJS awaits the Durable Object storage write before acknowledging
either update.

`createStudioMapUpdatePayload()` includes runtime-ready `worldUpdates` metadata.
The RPGJS Vite publisher and the Studio seed command consume it automatically:
they publish the selected map, then fan the topology out to every map room in
the world. If you build a custom publisher or call the HTTP API directly, you
must reproduce both steps. Sending only `/map/update` does not refresh the world
manager of a player who is currently on another map.

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
server-only publisher to send the configured maps on startup and after HMR. If
the resolved payload contains `worldUpdates`, the same publisher also calls the
world update endpoint for every referenced map room.
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

## Direct HTTP publication

Prefer the Vite publisher, the Studio seed command, or a trusted backend because
they perform the world fan-out. To inspect the HTTP contract manually, a complete
publication uses the same secret for both requests:

```bash
curl --fail-with-body \
  -X POST \
  -H 'content-type: application/json' \
  -H 'x-rpgjs-map-update-token: <secret>' \
  --data-binary @prepared-map.json \
  https://<worker>/parties/main/map-port/map/update

curl --fail-with-body \
  -X POST \
  -H 'content-type: application/json' \
  -H 'x-rpgjs-map-update-token: <secret>' \
  --data-binary @prepared-world.json \
  https://<worker>/parties/main/map-port/world/<world-id>/update
```

`prepared-world.json` can be either `{ "id": "<world-id>", "maps": [...] }`
or the maps array itself. Repeat the second request for every map id contained in
that world. A successful `2xx` response means the target room updated its live
world manager and persisted the topology.

## Production checklist

1. Authenticate Wrangler with `pnpm wrangler login` or configure the appropriate
   CI API token.
2. Build the MMORPG client and Worker entry.
3. Verify the binding and the `new_sqlite_classes` migration in `wrangler.jsonc`.
4. Configure the secret for the same environment that you will deploy:

   ```bash
   pnpm wrangler secret put RPGJS_MAP_UPDATE_TOKEN --env production
   ```

5. Deploy the Worker:

   ```bash
   pnpm wrangler deploy --env production
   ```

6. Point the trusted publisher at the deployed Worker URL and publish the start
   map. For Studio worlds, confirm that it reports successful world publication
   for every map room.
7. Open two clients, change maps in both directions, and inspect production logs
   with `pnpm wrangler tail --env production`.

Never expose `RPGJS_MAP_UPDATE_TOKEN` in browser code, a `VITE_` variable, a
committed `.env` file, or a public build artifact.

## Troubleshooting

| Symptom | Cause and check |
| --- | --- |
| `401 Unauthorized` | The publisher token does not match the Worker secret. Check `.env.local` against `.dev.vars` locally, or the secret in the selected production environment. |
| `503 Missing required Worker secret` | `RPGJS_MAP_UPDATE_TOKEN` is not configured for the Worker environment receiving the request. |
| The new map loads only after restarting Wrangler | The publisher sent `/map/update` but did not fan out `/world/:id/update`, or an older Worker bundle is still running. |
| The player is blocked at a world boundary | Inspect the current map room's topology. Both source and target map ids, dimensions, and runtime world coordinates must be present. |
| A room works until hibernation | Required state was kept only in memory. Republish the map and world with a Worker version that persists both before acknowledgement. |
| Local behavior differs from production | Confirm the same adapter, token, project id, map id, and Wrangler environment are used, then inspect `wrangler tail`. |

## Empty maps

When the final connection leaves a map, RPGJS stops its 60 Hz simulation loop.
Persisted state remains in the Durable Object. On the next connection, RPGJS
restores the state and rebuilds transient physics and event resources without
simulating elapsed empty-room time.
