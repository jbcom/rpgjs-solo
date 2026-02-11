---
title: MMORPG Map Sync And Trust Model
---

# MMORPG Map Sync And Trust Model

This document explains how map data is synchronized between client and server in RPG mode vs MMORPG mode, and why the trust model is different.

## Why This Exists

In standalone RPG mode, the client and server run in the same trusted process. In MMORPG mode, the client is untrusted and must not be allowed to authoritatively update map definitions.

Map definitions include:

- geometry and dimensions (`width`, `height`)
- events/NPC declarations
- world map topology (`worldMaps`)
- hooks and server-side map behavior

Allowing arbitrary clients to push this data is a security risk.

## Modes

## Standalone RPG

- `LoadMapService.load()` calls `UpdateMapService.update(map)` on the local bridge.
- The server is local/in-process, so this is a trusted path.
- This keeps map update fully automatic for local RPG development.

## MMORPG (Production)

- `UpdateMapService.update()` in MMORPG is intentionally a no-op.
- Gameplay clients cannot push `/map/update`.
- Authoritative map updates must come from a trusted backend source:
  - server bootstrap
  - admin tooling
  - editor pipeline with authentication/authorization

## MMORPG Dev With Vite

To keep development ergonomic without granting authority to clients:

- `@rpgjs/vite` server plugin initializes `map-*` rooms server-side.
- On room creation, the plugin performs a server-side `/map/update` call.
- The client does not perform map update requests.

This gives "auto update in dev" behavior while preserving the production trust boundary.

## Server-Side Dimension Fallback

During Vite auto-bootstrap, the plugin may only know `map.id`. In this case:

- bootstrap sends `width = 0`, `height = 0`
- `RpgMap.updateMap()` resolves dimensions from server world metadata (`worldMaps`) when available
- if no trusted dimensions exist, it falls back to default safe values

This keeps `autoChangeMap` consistent when world metadata is defined on the server.

## Change Map Transfer

Map transfer is still snapshot-based:

1. source map creates transfer snapshot
2. server emits `changeMap` with target map and `transferToken`
3. client reconnects using that token
4. target map restores player state

The transfer preserves player state; map definitions remain server authority.

## Operational Rule

Client gameplay traffic can move players, not redefine maps.
