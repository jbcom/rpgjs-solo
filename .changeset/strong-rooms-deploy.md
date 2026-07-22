---
"@rpgjs/server": minor
"@rpgjs/vite": minor
"@rpgjs/common": minor
"@rpgjs/client": minor
"@rpgjs/tiledmap": minor
"@rpgjs/studio": minor
---

Add production Signe room adapters for persistent Node servers and Cloudflare Durable Objects, plus remote Vite map publication for trusted editor workflows with transient-only retries. Resolve local TMX files and their external tilesets when publishing maps, recreate configured events safely during live map updates, and restore player and event graphics after clients reload the Tiled scene.

Add provider-neutral authoritative map streaming with progressive render/physics chunks, client prediction barriers, and spatial interest management for players, NPCs, events, and projectiles. Keep complete Tiled TMX/TSX sources server-side in MMORPG mode while sharing the same game module between Node.js, local Wrangler, and Cloudflare Durable Object hosts.

Use the physics broad-phase index when resolving synchronized entities in each player's retained chunks, avoiding full-room player and event scans on every sync packet.

Assign Tiled collision geometry to every streamed chunk it intersects, and preserve the generated client reference for action, dash, pointer, and interaction APIs with a dedicated interactions guide.

Preserve initial room synchronization on older local Workerd runtimes that expose an accepted Durable Object WebSocket with a transient `CONNECTING` ready state.

Prevent CanvasEngine rain layers from retaining tick subscriptions when an asynchronous mount overlaps destruction or another mount.

Keep component-ready standalone Studio maps intact when sharing the in-memory server, and select the Cloudflare publisher independently from the generic MMORPG entry so local Node.js development does not require a Worker secret.

Add Studio v2 authoritative map preparation and progressive chunk streaming, including server physics, nearby rendering data, and provider-neutral entity synchronization. Trusted Vite publishers can now resolve a complete Studio payload before sending it to Node or Cloudflare map rooms, while raw Studio map structure, events, database records, and global collision data stay server-side.

Make initial map streaming explicit and hibernation-safe: clients request a fresh manifest after joining, trusted map updates are durably stored before acknowledgement, and recreated Durable Object room instances rebuild their transient streaming runtime. Stream Studio terrain control masks per chunk so transition rendering and prediction physics work without disclosing the complete map, and reset spatial visibility on reconnect so existing clients receive newly joined players.

Preserve custom streaming providers when Studio's built-in streaming is disabled, refresh cached client controllers after Durable Object hibernation, and key terrain-control buffers by their complete streamed region content to prevent stale masks.

Avoid dereferencing an empty Studio weather state while switching maps.

Publish authenticated world topology updates to every map room, persist them across Durable Object hibernation, and refresh automatic world-map transitions without restarting the MMORPG server.

Document the Durable Object room model, map-and-world publication flow, hibernation recovery, production deployment, and common Cloudflare diagnostics.

Correct the documented default runtime to standalone RPG and add a beginner deployment path that takes the v5 starter through explicit MMORPG development, private map bundling, authenticated map publication, a persistent Node Docker deployment, or a Cloudflare Durable Object deployment. Include an executable production map publisher in the Cloudflare sample and make the production pages discoverable from both documentation navigations.

Declare the RPGJS Durable Object binding explicitly in Wrangler staging and production environments so isolated deployments keep their room namespace.

Cover the previous Studio scene before unmounting it during World transfers, preserve recent directional movement into the destination room, then reveal the new map through a full-screen dark transition with a centered, delayed localized loader and a bounded asset wait so stale or white frames cannot flash while fast local transitions stay unobtrusive.
