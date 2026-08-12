# RPGJS v5 beta.30 upstream audit

Status: pre-implementation classification. No upstream behavior is adopted by
this document alone.

RPGJS Solo audits upstream `RSamaium/RPG-JS:v5` from
`2fab01fb8e93ad13902b07db28935f058b387213` through
`5a306c9bd0caa1b65f5c73607eb0de7e60111078`. The range contains four commits:

1. `e0bba296` — class restoration, Studio HUD/map changes, and an inherited
   Action Battle action bar;
2. `d005fddb` — Studio terrain readiness and chunk-rendering work;
3. `aed4d3ed` — scaled sprite bounds and character hitbox work; and
4. `5a306c9b` — upstream beta package metadata and changelogs.

The tracking branch may fast-forward to the exact upstream commit only after
the inherited publish workflow is confirmed disabled. The fork's exact-SHA CI
then validates that public tracking ref, and no product-branch adoption may
begin unless that run passes. The product branch receives only the deliberately
selected pieces below.

## Classification

### Portable

- Plain-object class restoration and late class-parameter patch semantics are
  reusable where they operate on one authoritative local player/database
  graph. Their tests must be adapted to prove object identity and direct local
  state, not synchronized replicas.
- Normalized adjacent-map world coordinates are reusable at the local map
  lifecycle boundary. Solo owns transfer and persistence; an upstream room is
  never product authority.
- Pure Studio default-class/database authoring behavior is reusable when it
  does not introduce an HTTP, socket, room, or synchronization dependency.
- Pure Studio terrain-readiness and chunk-rendering transforms are reusable as
  authoring/rendering behavior. Readiness must resolve from local loaded data.
- Scaled sprite-alpha bounds and character-hitbox geometry are reusable as
  renderer utilities. They must be consumed through the existing Solo
  renderer boundary and preserve Pixi/CanvasEngine compatibility.
- The exact upstream package versions, changelogs, changesets, and public API
  updates are audit evidence for the adopted baseline. They do not version the
  four private Solo packages by themselves.

### Adaptable

- The inherited Action Battle hotbar is a useful UI and input reference, but
  Solo Action Battle owns command availability, targeting, execution, pause,
  and modal input. Port its presentation and keyboard concepts only through
  the direct Solo command surface; do not reintroduce `RpgPlayer` server
  mutation or client/server messages.
- Studio HUD display and reactive parameter updates may be retained as local
  view projection. Rendering reads the authoritative local graph; it cannot
  become a second synchronized source of gameplay truth.
- Map-transition helpers may be adapted into the Solo runtime only through
  direct local lifecycle calls with save/replay identity preserved.

### Excluded

- `@signe/room`, `@signe/sync`, sockets, HTTP game-data authority, serialized
  command transport, server/client replicas, prediction, reconciliation, and
  multiplayer ownership remain outside all Solo production dependency graphs.
- Upstream room broadcasts, player sync calls, remote HUD messages, and
  server-owned Action Battle execution are compatibility source only. Version
  parity is not authority to include them.
- The upstream release commit cannot replace the fork's exact Node 24.19.0,
  pnpm 11.21.0, Vite/CanvasEngine cohort, public Solo packages, release
  transaction, GitHub-first authority, Gitea backup, or private-registry proof.

## Required implementation sequence

1. Confirm the inherited publish workflow remains disabled, then fast-forward
   public GitHub `v5` exactly from `2fab01fb` to `5a306c9b`. Dispatch the fork
   workflow against that exact SHA and block product work until it passes.
2. Port only the approved files and hunks from the three upstream implementation
   commits to a focused feature branch based on canonical GitHub `main`;
   preserve the Solo runtime and current toolchain. Keep rooms, sockets,
   synchronization, transports, server-owned execution, and upstream release
   metadata out of the product branch unless a separate review explicitly
   approves them. Regenerate the lockfile rather than choosing either side.
3. Add focused Solo tests for class restoration, local map transitions,
   renderer bounds/hitboxes, terrain readiness, and direct-command action-bar
   behavior. Add negative production-bundle tests for every excluded category.
4. Run frozen install, build, complete unit/type/API/boundary gates, packed
   ESM/CJS/declaration consumers, the matching starter branch, and a silent
   rendered browser interaction under exact Node 24.19.0.
5. Obtain a producer-disjoint independent review and merge the exact reviewed
   tree into public GitHub `main`; allow the checked GitHub-to-Gitea backup to
   converge without making Gitea a development authority.
6. Create one coherent four-package Solo prerelease derived from beta.30. The
   final suffix is selected by the release transaction and is not guessed in
   this audit. Publish only byte-identical reviewed artifacts, tags, releases,
   registry metadata, and tarballs.

Quest for the Crown may adopt the cohort only after this complete release gate.
The currently published `5.0.0-beta.29.solo.2` packages are newer than Quest's
pin but do not satisfy the accepted beta.30-derived dependency contract.
