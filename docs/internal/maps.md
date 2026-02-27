---
title: Map Architecture
description: Internal map architecture and cross-room transfer model in RPGJS.
---

# Map Architecture

This document is for internal development only. It describes how maps are hosted across rooms and how player state is transferred between them. It is not part of the public framework API.

## Rooms and Maps

Each map runs inside its own room. Rooms can live on different servers, so map-to-map transitions are a server-to-server handoff, not just a local map swap.

## Cross-Room Player Transfers

When a player moves from one map to another:

1. The current room creates a snapshot of the player state.
2. That snapshot is sent to the destination room (the new authoritative server).
3. The client reconnects to the destination room.
4. The destination room restores the snapshot into a new player instance.

State that must be preserved includes:

- Items and skills (hydrated via resolvers).
- HP/SP, parameters, effects, class, and states.
- Any additional server-side state marked for snapshotting.

Position is managed separately by the destination map.

## Why Snapshots Matter Here

Room transfer and save/restore both depend on the same snapshot format and hydration process. Keeping snapshot resolution centralized ensures that cross-room transfers and saves behave consistently.

Related docs:

- `docs/internal/snapshots.md`
