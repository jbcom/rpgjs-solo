---
title: Event Modes Architecture
---

# Event Modes Architecture

This document is for internal development only. It explains how `shared` and `scenario` event modes are implemented in server runtime, synchronization, and physics.

## Goal

Support two behaviors with one event API:

- `shared`: one runtime event for the whole map.
- `scenario`: one runtime event per player, isolated from other players.

## Runtime Model

Core implementation is in `packages/server/src/rooms/map.ts`.

Runtime registries:

- `_scenarioEventTemplates`: scenario definitions stored at map load.
- `_eventModeById`: runtime event id -> mode.
- `_eventOwnerById`: runtime event id -> owner player id (scenario only).
- `_scenarioEventIdsByPlayer`: player id -> set of spawned scenario event ids.

ID strategy:

- Shared events keep normal ids.
- Scenario events are namespaced per owner: `baseId::playerId` (with suffix fallback if needed).

## Lifecycle

### Map Load

During `updateMap()`:

1. Event definitions are normalized.
2. Shared events are created immediately.
3. Scenario events are stored as templates.
4. For already connected players, scenario instances are spawned from templates.

### Player Join

During `onJoin()`:

1. Player body is restored/aligned.
2. Scenario instances are spawned for this player only.

### Player Leave

During `onLeave()`:

1. Scenario instances owned by this player are removed.
2. Runtime metadata is cleaned.

## Visibility and Network Sync

Visibility gate is `isEventVisibleForPlayer(eventOrId, playerOrId)`:

- `shared` -> visible to everyone.
- `scenario` -> visible only to owner player id.

This gate is used in:

- packet interception (`interceptorPacket`) to filter `packet.value.events` per recipient.
- interaction hooks (`onAction`, touch/shape checks) so players only interact with visible instances.
- player-side change propagation (`_eventChanges`) to avoid calling hooks on hidden scenario events.

## Physics Isolation

Implementation in `packages/common/src/rooms/Map.ts` (entity resolution filter).

Behavior:

- Scenario event vs non-owner player: no collision resolution.
- Scenario event vs scenario event with different owner: no collision resolution.
- Scenario event vs owner player: collisions behave normally.

This gives per-player "private physics" while keeping shared physics unchanged.

## Removal and Teardown Safety

Event removal (`removeEvent`) performs best-effort movement teardown before deletion:

- `stopMoveTo?.()`
- `breakRoutes?.(true)`

Both are guarded to tolerate race conditions where physics entities are already destroyed.

`stopMoveTo()` in `MoveManager` also guards unresolved-entity errors (`unable to resolve entity`) during async AI teardown.

## Tradeoffs

- Shared mode is cheaper and globally consistent.
- Scenario mode scales with number of players because events are duplicated.
- Visibility filtering is mandatory to avoid leaking scenario entities to other clients.

## Invariants

- Shared events must always remain visible to all players.
- Scenario events must never be visible outside their owner.
- Scenario events from different owners must not block each other in physics.
- Cleanup must remove runtime metadata and event instances together.

