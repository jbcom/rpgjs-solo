---
title: "Common Commands"
description: "Core server-side player commands defined on the main Player class."
---

# Common Commands

Core server-side player commands defined on the main Player class.

## Members

- [Run Sync Changes](#run-sync-changes)

## Run Sync Changes

Run the change detection cycle. Normally, as soon as a hook is called in a class, the cycle is started. But you can start it manually
The method calls the `onChanges` method on events and synchronizes all map data with the client.

- Source: `packages/server/src/Player/Player.ts`
- Kind: `method`
- Member of: `Player`
- Defined in: `RpgPlayer`

### Signature

```ts
player.syncChanges()
```
