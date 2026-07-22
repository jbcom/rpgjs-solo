# Contributing to RPGJS Solo

RPGJS Solo is a single-player-first fork of RPGJS v5. It exists to retain
RPGJS's mature RPG authoring model while removing the client/server runtime from
games that will never be multiplayer.

## Branch model

- `v5` tracks `RSamaium/RPG-JS:v5`. Do not merge Solo product work into it.
- `solo` is the product branch.
- Start work from `solo` on a focused feature branch and open a PR back to
  `solo`.
- Audit upstream changes on the tracking branch before porting them. A newer
  upstream release is not adopted by copying package versions alone; relevant
  behavior, tests, migrations, and bundle effects must be reconciled.

## Product principles

### One authoritative runtime

A Solo game has one in-process gameplay object graph. Player, map, event,
inventory, combat, quest, and save behavior operate on that graph directly.
Rendering may maintain derived caches or view objects, but they are not a
second synchronized source of gameplay truth.

### Direct commands, not pretend networking

Keyboard, pointer, touch, gamepad, accessibility controls, replays, and AI
governors emit the same typed commands into the runtime. They must not traverse
a WebSocket-shaped adapter, fake HTTP request, room transport, serialization
layer, prediction buffer, or reconciliation path.

### Local maps, not multiplayer rooms

Maps remain valuable loading, streaming, collision, event, and authoring
boundaries. They are not network rooms. Map transfer must retain player and
world state through explicit local lifecycle APIs.

### Reuse the RPG framework

Do not replace RPGJS wholesale with a hand-built engine. Refactor and reuse its
maps, players, events, database entries, GUI, Tiled integration, movement,
physics, action battle, lighting, projectiles, saves, hooks, and module model.
Break compatibility only when the old API encodes client/server ownership.

### Add and subtract before mutating

Keep the Solo divergence as an overlay that remains cheap to reconcile while
RPGJS v5 stabilizes:

- add Solo-specific packages, entries, adapters, tests, and exports beside
  inherited code;
- reductively exclude multiplayer-only packages from Solo release manifests and
  bundle entry points;
- when reusable behavior is trapped in an inherited package, prefer extracting
  a new pure module and making the old package consume or re-export it;
- isolate unavoidable inherited-file changes in small commits that can be
  reviewed independently or offered upstream; and
- reject broad renames, directory moves, formatting sweeps, and in-place
  rewrites that manufacture merge conflicts without changing the product.

An additive seam must be attempted and documented before a mutating refactor is
accepted.

### Local-first production quality

Solo's priorities are deterministic stepping, pause/resume, replayable input,
save integrity and migrations, browser/native lifecycle, controller and touch
support, accessibility, fast startup, bounded bundles, and authored-game test
coverage. Optional cloud saves or telemetry belong behind adapters and cannot
become runtime authority.

## Migration rule

The inherited source still contains `client`, `server`, room, sync, and
transport concepts. Each migration change must do at least one of these:

1. establish a transport-free public boundary;
2. move reusable RPG behavior behind that boundary;
3. remove a network-only dependency from the Solo production graph; or
4. prove compatibility while deleting an inherited dual-runtime path.

Renaming a server class, wrapping a fake socket, or hiding network terminology
without removing the second state model is not progress.

## API and documentation rules

- Document every changed public API in the same PR.
- Give public APIs precise TypeScript types and JSDoc with runnable examples.
- Avoid `any` in public contracts; use discriminated unions, generics, or
  overloads where behavior varies.
- Preserve content and authoring compatibility when it does not compromise the
  Solo runtime contract.
- Route player-visible framework text through the i18n service.
- Prefer small modules, hooks, providers, and registries over game-specific
  behavior in core packages.

## Rendering and UI

CanvasEngine/Pixi remains the default world renderer. DOM frameworks such as
React or Vue may provide application UI and accessible overlays through a
documented bridge. Rendering reads reactive local state; it does not consume a
network synchronization protocol.

## Testing requirements

Changes must include the narrowest useful tests plus the affected integration
lane. The Solo release train requires:

- direct command-to-state tests;
- object-identity and single-source-of-truth tests;
- deterministic fixed-step and replay tests;
- real browser map, input, GUI, pause/resume, and save/load tests;
- dependency and bundle audits banning multiplayer-only runtime code;
- compatibility fixtures for retained RPGJS authoring APIs; and
- at least one real-game vertical slice before a stable release.

Use the committed toolchain and lockfile:

```bash
nvm use
pnpm install --frozen-lockfile
pnpm build
pnpm test -- --run
```

Solo targets the current Node 24 LTS line. Do not retain an older inherited CI
runtime merely because upstream still tests it.

## Packages and releases

Every publishable package change requires a Changeset:

```bash
pnpm changeset
```

Solo packages remain prerelease until every non-negotiable gate in the root
README passes. Published versions must identify the exact upstream baseline and
carry no dependency range that silently moves the underlying engine.

## Upstream contributions

General RPGJS fixes that do not depend on Solo's product decision should be
kept easy to offer upstream. Avoid mixing an upstreamable defect fix with a
large Solo-only refactor. The fork's MIT lineage and attribution must remain
clear.
