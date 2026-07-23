![RPGJS upstream header](/header.png)

# RPGJS Solo

RPGJS Solo is a public, single-player-first fork of
[RPGJS v5](https://github.com/RSamaium/RPG-JS). It keeps RPGJS's useful RPG
vocabulary—Tiled maps, players, events, classes, items, skills, action combat,
GUI, and save/load—while replacing the embedded client/server simulation with a
true in-process game runtime.

> **Pre-alpha:** this repository currently starts from the exact RPGJS v5
> upstream source. The existing `provideRpg()` path still emulates a server,
> rooms, sockets, messages, and synchronized client state inside the browser.
> RPGJS Solo will not publish a stable runtime until the direct-runtime gates
> below pass. Do not mistake the fork name for a completed architectural cut.

## Why this fork exists

Upstream RPGJS intentionally makes standalone games and MMORPGs share one
server-authoritative architecture. That is valuable when a game may become an
MMO, but it makes a permanently local, authored RPG pay for two object graphs,
transport-shaped APIs, serialization, synchronization, prediction, room
lifecycles, and multiplayer deployment concerns it does not need.

RPGJS Solo chooses a different product:

| RPGJS v5 upstream | RPGJS Solo |
|---|---|
| One gameplay architecture for RPG and MMORPG modes | One runtime designed only for local single-player RPGs |
| Server owns gameplay state; client owns a synchronized view | One authoritative in-process object graph |
| Inputs cross a socket-shaped command boundary | Inputs invoke typed runtime commands directly |
| Maps are multiplayer rooms | Maps are local world and streaming boundaries |
| Prediction and reconciliation are core concerns | Deterministic stepping, pause, replay, and save integrity are core concerns |
| Node and Cloudflare transports are supported products | No network gameplay transport ships in the Solo runtime |

Cloud saves, achievements, telemetry, or an optional user-owned sync service are
compatible with this direction. Multiplayer gameplay and remote authority are
not.

## Target mental model

```text
player, touch, gamepad, or AI input
  -> typed game command
  -> one local RPG runtime
  -> reactive world state
  -> CanvasEngine rendering and UI (Pixi remains an internal backend)
  -> versioned save snapshot
```

The engine may maintain render caches and view objects, but those are derived
presentation state. There must not be a second gameplay-authoritative client
model synchronized from a pretend server.

## Solo packages

The first additive package seam is intentionally small and independently
publishable from the inherited RPGJS package graph:

| Package | Responsibility |
|---|---|
| `@jbcom/rpgjs-solo` | Direct commands, deterministic local worlds, authoritative entities, pause, actions, and saves |
| `@jbcom/rpgjs-solo-action-battle` | Fixed-tick attack profiles, targeting, guard, statuses, melee/projectiles, damage, defeat, and combat telemetry |
| `@jbcom/rpgjs-solo-renderer` | Native Tiled maps, CanvasEngine scenes, camera, spritesheets, fog of war, direct input, `@rpgjs/ui-css` host, and test auto-mute |
| `@jbcom/rpgjs-solo-vite` | Production-bundle rejection of room/sync/socket/prediction regressions |

All Solo packages are versioned against the exact RPGJS beta baseline and
publish only to the Gitea `jbcom` npm registry. Their direct runtime and build
dependencies are exact versions, and every release rechecks them against the
current compatible upstream releases. A private Solo package is not
feature-complete while that check reports a knowingly stale direct dependency.

After the Node 24 build, tests, Solo boundary, and
`pnpm verify:solo-package-contracts` pass, an authenticated maintainer publishes
the filtered package set in dependency order with `pnpm publish:solo`. The
shared publish guard rejects npm for every Solo package, and the package check
proves every pnpm-packed manifest is consumer-safe and contains no unresolved
workspace protocol. Credentials remain outside the repository; anonymous LAN
access is not assumed, so consumers authenticate to the private `jbcom`
registry through their user-level npm configuration.

## Non-negotiable release gates

A Solo runtime release must prove all of the following:

- the production dependency graph contains no `@signe/room`, `@signe/sync`,
  WebSocket implementation, Node transport, or Cloudflare room runtime;
- local input and action-combat commands use direct typed calls, with no fake
  HTTP request, socket, message serialization, prediction, or reconciliation;
- player, map, event, inventory, combat, quest, and save systems observe one
  authoritative object graph;
- Tiled maps, events, classes, items, skills, states, action battle, GUI,
  lighting, projectiles, and pluggable saves retain compatible authoring APIs
  wherever compatibility does not preserve the client/server model;
- browser tests prove map transfer, save/load, pause/resume, gamepad/touch, and
  a substantial real game vertical slice;
- an automated bundle audit fails if multiplayer-only code leaks back into the
  shipped Solo packages.
- the current Node 24 LTS and committed latest pnpm version install the frozen
  lockfile, and each private package is built and tested with current compatible
  TypeScript, Vite, Vitest, and declaration tooling.

The accepted architecture decision is recorded in
[`docs/internal/adr/005-solo-runtime.md`](docs/internal/adr/005-solo-runtime.md).

## Branches and upstream sync

- `v5` mirrors the upstream default branch and is not the product branch.
- Gitea `main` is the canonical RPGJS Solo product branch.
- changes target Gitea `main` through reviewed feature branches.
- GitHub is a public downstream mirror and is never the development record.
- upstream changes are first audited on `v5`, then deliberately ported or
  merged into `main`; transport/MMORPG changes are not inherited by default.

See [`docs/upstream-sync.md`](docs/upstream-sync.md) for the exact procedure and
compatibility ledger.

## Overlay strategy

Solo evolves **additively and reductively**:

- add new Solo runtime, action-battle, native renderer, Vite, and testing packages beside the
  inherited packages;
- reuse stable upstream leaf packages and public RPG concepts;
- remove room, sync, transport, prediction, and MMORPG packages from the Solo
  publish and bundle graph;
- prefer a new pure module plus a compatibility re-export over moving or
  rewriting an inherited implementation; and
- keep unavoidable edits to inherited files small, separately committed, and
  independently replayable or droppable during upstream synchronization.

Large in-place rewrites of upstream packages are rejected unless an additive
seam has been proven impossible. This keeps the fork syncable as RPGJS v5 moves
from beta to production.

## Development

```bash
git clone https://git.local.jonbogaty.com/jbcom/rpgjs-solo.git
cd rpgjs-solo
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm test -- --run
```

The supported toolchain is the current Node 24 LTS line with the committed pnpm
version. The repository remains a pnpm monorepo while the direct runtime is extracted.
Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before changing engine architecture.

## Upstream and license

RPGJS Solo is based on [RSamaium/RPG-JS](https://github.com/RSamaium/RPG-JS)
and preserves its MIT license and attribution. The public
[GitHub fork](https://github.com/jbcom/rpgjs-solo) mirrors the Gitea-canonical
product for source availability. This project does not submit changes back to
upstream.

MIT. Free for commercial use.
