# ADR 005: A true single-process RPG runtime

- Status: Accepted
- Date: 2026-07-22
- Decision owners: jbcom RPGJS Solo maintainers
- Upstream baseline: `RSamaium/RPG-JS:v5` at `e286ecf18ad85d5fab38b659ab95758a7f7a7c96`

## Context

RPGJS v5 deliberately uses one server-authoritative architecture for both
standalone RPGs and MMORPGs. Its browser-standalone provider creates in-memory
Signe rooms, a client/server bridge, socket-shaped connections, HTTP-shaped map
updates, synchronized client entities, prediction, and reconciliation. No
external network is required, but the game still runs through a networking
architecture.

That is the correct trade for projects that may become multiplayer. It is the
wrong permanent cost and mental model for the authored single-player games this
fork targets. Those games need the mature RPG systems, not a hidden MMO server.

## Decision

RPGJS Solo will implement a direct, in-process runtime with one authoritative
gameplay object graph.

The direct runtime will:

- accept typed movement and action commands directly from human, replay, and AI
  input providers;
- own players, maps, events, database entries, combat, quests, and save state in
  one local lifecycle;
- expose reactive state to CanvasEngine/Pixi and application UI without a
  serialization or synchronization boundary;
- treat maps as local world/loading boundaries rather than rooms;
- use deterministic stepping and explicit pause/resume semantics;
- keep storage pluggable through a small local save strategy; and
- exclude all multiplayer transports and authority logic from production
  packages and bundles.

Cloud save or telemetry adapters may observe or persist snapshots. They cannot
own gameplay state or introduce a second live model.

## Compatibility policy

The fork will preserve RPGJS's content-facing vocabulary and APIs wherever
their behavior is independent of client/server ownership:

- Tiled maps and world files;
- players and events;
- items, weapons, armors, classes, skills, and states;
- modules and lifecycle hooks;
- movement, physics, lighting, weather, projectiles, and action battle;
- GUI and i18n; and
- save snapshots and storage strategies.

An API may change when its parameters, lifecycle, or guarantees encode rooms,
remote authority, synchronization, prediction, reconciliation, or socket
transport. Compatibility shims must delegate to direct behavior and may not
recreate the removed architecture.

## Package direction

Migration proceeds as an additive/reductive overlay behind a new Solo public
boundary rather than by renaming or rewriting the inherited `client` and
`server` packages in place. The upstream source stays structurally recognizable
so `v5` can continue moving toward production without turning every sync into a
manual port.

1. Add transport-free Solo runtime, Vite, renderer-adapter, and testing packages
   beside the inherited packages.
2. Reuse upstream leaf packages when their dependency closure is already local
   and single-player-safe.
3. Where reusable behavior is trapped behind networking, add a pure module and
   make inherited code consume or re-export it instead of moving the original
   surface wholesale.
4. Adapt CanvasEngine/Pixi to observe the same local objects.
5. Port Tiled, action battle, GUI, and saves one vertical slice at a time.
6. Reductively omit the inherited standalone bridge and every network package
   from Solo release manifests and production bundles.
7. Keep unavoidable mutations to inherited files narrow, separately committed,
   and independently replayable or droppable during upstream synchronization.
8. Keep MMORPG packages as upstream migration inputs; do not publish them as
   Solo products.

Package names and public npm scope remain prerelease decisions until a vertical
slice proves the boundary.

## Enforcement gates

CI must eventually enforce all of these mechanically:

- no `@signe/room`, `@signe/sync`, `ws`, Node transport, or Cloudflare runtime
  in Solo production dependency closure;
- no `WebSocket`, `Request`, `Response`, fake URL, serialized message, network
  prediction, or reconciliation in direct-runtime source and output;
- object-identity tests prove gameplay systems and rendering observe the same
  player/map/event state;
- direct input tests cover keyboard, touch, gamepad, replay, and AI providers;
- retained RPGJS content fixtures compile and behave correctly; and
- production bundle reports and a real-game headed-browser playthrough pass.

## Upstream synchronization

The `v5` branch tracks upstream. Gitea `main` is the product branch; GitHub is a
public downstream mirror. Upstream
changes are classified as:

- **portable:** RPG/content fixes independent of networking;
- **adaptable:** useful behavior whose implementation must be rewritten for the
  direct runtime; or
- **excluded:** multiplayer transport, room, sync, prediction, reconciliation,
  or deployment-only work.

The classification and adopted upstream commit are recorded for every sync.

## Consequences

Positive consequences:

- game authors reason about one local runtime;
- AI governors and human controls share a direct input contract;
- saves, replay, pause, and deterministic tests become first-class rather than
  transport special cases;
- bundle and maintenance cost can reflect single-player needs; and
- the fork can still inherit mature RPG systems from upstream.

Costs and risks:

- this is a real architectural fork, not a configuration flag;
- upstream changes touching state ownership require deliberate ports;
- the migration must temporarily maintain compatibility fixtures across two
  architectures; and
- no stable release is allowed until a substantial game proves the new runtime.

## Rejected migration strategy

A broad in-place rewrite, mass rename, or directory reshuffle of upstream
packages is rejected. It would make RPGJS v5 beta-to-production updates costly
to reconcile and would obscure whether a conflict represents a real product
difference or incidental file churn. Any proposal to mutate an inherited core
must first document why an additive package, compatibility export, or reductive
release boundary cannot solve the problem.
