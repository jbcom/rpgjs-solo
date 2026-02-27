---
title: Snapshot Architecture
description: Internal snapshot hydration and instance creation architecture.
---

# Snapshot Architecture

This document is for internal development only. It describes how snapshot hydration works on the server and where item/skill instance creation is centralized. It is not part of the public framework API.

## Snapshot Hydration (Server)

Snapshots from `@signe/sync` are intentionally lightweight and typically include IDs only (for example, `items: [{ id: "potion" }]` and `skills: [{ id: "fire" }]`). Before applying a snapshot to a player, the server must resolve those IDs into runtime instances.

Current flow:

1. `createStatesSnapshotDeep(player)` returns lightweight data.
2. `BaseRoom.onSessionRestore()` resolves IDs into instances using the room database.
3. `RpgPlayer.applySnapshot()` resolves and applies the snapshot via `load()`, then explicitly resets `items`, `skills`, `states`, `_class`, and `equipments` with hydrated instances.

Key file references:

- `packages/server/src/Player/Player.ts`
- `packages/server/src/rooms/BaseRoom.ts`
- `packages/server/src/rooms/map.ts`

## Item/Skill Instance Factories

To avoid duplication and side effects during hydration, instance creation is centralized:

- `WithItemManager.createItemInstance()` creates an `Item` instance without inventory changes or hooks.
- `WithSkillManager.createSkillInstance()` creates a `Skill` instance without learning hooks or gameplay effects.

Both `addItem` and `learnSkill` reuse these factories and then apply side effects (inventory insertion and hooks) only in the normal gameplay flow.

Key file references:

- `packages/server/src/Player/ItemManager.ts`
- `packages/server/src/Player/SkillManager.ts`
- `packages/server/src/Player/StateManager.ts`
- `packages/server/src/Player/ClassManager.ts`

## Timing Note

Resolvers depend on an initialized room database. If the map database is not ready, hydration will not occur and snapshot entries remain plain objects. In that case, rehydrate after map readiness (for example, after `dataIsReady$` or during room session restore).

## Snapshot Use Cases

- Session restore when a player reconnects to a room.
- Save/load of player state (manual or autosave).
- Periodic snapshots for authoritative server state.
