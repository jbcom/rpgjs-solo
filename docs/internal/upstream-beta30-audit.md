# RPGJS v5 beta.30 upstream audit

Status: pre-implementation classification. No upstream behavior is adopted by
this document alone.

RPGJS Solo audits upstream `RSamaium/RPG-JS:v5` from
`2fab01fb8e93ad13902b07db28935f058b387213` through
`5a306c9bd0caa1b65f5c73607eb0de7e60111078`. The range contains four commits:

1. `e0bba296` — class restoration, Studio HUD/map changes, and an inherited
   Action Battle action bar;
2. `d005fddb` — Studio terrain readiness and chunk-rendering work;
3. `aed4d3ed` — scaled visible graphic bounds and component placement; and
4. `5a306c9b` — upstream beta package metadata and changelogs.

The inherited publish workflow was confirmed disabled and public GitHub `v5`
was fast-forwarded exactly to `5a306c9b`. Exact-SHA Fork CI run
[`31594915618`](https://github.com/jbcom/rpgjs-solo/actions/runs/31594915618)
proved that requested fork and upstream identity and completed a frozen install,
then failed the unmodified upstream tree's workspace audit with 69 advisories
(1 critical, 33 high, 26 moderate, and 9 low). That is valid red source evidence:
it permits recording the immutable tracking source but denies product adoption.
The maintained GitHub mainline owns dependency repair and must pass its complete
gate together with the deliberately selected ports.

The exhaustive source authority is
[`upstream-beta30-disposition.json`](./upstream-beta30-disposition.json). Its
executable verifier reconstructs all four Git objects, exhaustively matches 64
per-commit path touches across 63 unique paths, verifies every blob SHA-256,
and binds each behavior to a disposition, additive Solo target, and focused or
negative validation contract. It contains 21 `PORT_REQUIRED`, 12 `TEST_ONLY`,
30 `BOOKKEEPING_ONLY`, one `REJECTED`, and zero `PORTED` path touches. This
prose is only a summary and grants no implementation authority by itself.

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
- Intrinsic source-texture dimensions, alpha-bound refresh, scaled visible
  graphic bounds (including mirrored and nonuniform scale), full-frame
  fallback, and character-component placement are reusable renderer concepts.
  They change graphic presentation bounds, not gameplay collision hitboxes,
  and must preserve the Solo CanvasEngine renderer boundary.
- A one-frame Studio icon may expose `textures.default` as the same texture
  object as `textures.stand`; this is local spritesheet normalization, not
  permission to adopt remote Studio assets or GUI transport.

### Tracking evidence only

- The exact upstream package versions, changelogs, changesets, and public API
  snapshots are bookkeeping evidence for the audited candidate baseline only.
  They are excluded from the product port and do not version the four private
  Solo packages.

### Adaptable

- The inherited Action Battle-specific action bar is a useful UI and input
  reference and remains distinct from upstream's generic persistent hotbar.
  Solo Action Battle owns command availability, targeting, execution, pause,
  and modal input. Port action-bar presentation and keyboard concepts only
  through the direct Solo command surface; do not reintroduce `RpgPlayer`,
  server-owned action execution, remote GUI lifecycle, or client/server
  messages.
- Studio HUD display and reactive parameter updates may be retained as local
  view projection. Rendering reads the authoritative local graph; it cannot
  become a second synchronized source of gameplay truth. Upstream server GUI
  icon serialization is test evidence only and is not a Solo transport shape.
- Map-transition helpers may be adapted into the Solo runtime only through
  direct local lifecycle calls with save/replay identity preserved.

### Excluded

- `@signe/room`, `@signe/sync`, sockets, HTTP game-data authority, serialized
  command transport, server/client replicas, prediction, reconciliation, and
  multiplayer ownership remain outside all Solo production dependency graphs.
- Upstream room broadcasts, player sync calls, remote HUD messages, and
  server-owned Action Battle execution are compatibility source only. Version
  parity is not authority to include them.
- The concrete hosted Studio playground project/map UUIDs and
  `rpgjs.studio` API/assets endpoints are rejected; local examples and runtime
  defaults must not embed them.
- The upstream release commit cannot replace the fork's exact Node 24.19.0,
  pnpm 11.21.0, Vite/CanvasEngine cohort, public Solo packages, release
  transaction, GitHub-first authority, Gitea backup, or private-registry proof.

## Required implementation sequence

1. Preserve the completed exact public `v5` fast-forward and run
   `31594915618` as immutable source evidence. Do not rewrite upstream tracking
   history merely to make its dependency audit green.
2. Repair the maintained mainline dependency/toolchain graph, then implement
   only the 21 `PORT_REQUIRED` touches and translate the 12 `TEST_ONLY` touches
   through the exact additive targets and contracts in the disposition ledger.
   Keep the rejected hosted configuration, all excluded rooms/sync/transports,
   server-owned execution, and all 30 bookkeeping touches out of the product
   branch. Regenerate the lockfile from maintained main rather than choosing
   either side wholesale.
3. Add the ledger-prescribed focused Solo tests for class restoration, local
   world adjacency/border transfers, HUD continuity, icon aliasing, scene and
   terrain readiness, graphic bounds, and direct-command action-bar behavior.
   Add its negative boundary tests for every excluded behavior. Add a new
   Solo-owned Changeset that names all four `@jbcom/rpgjs-solo*` packages and
   describes only the behavior actually implemented; upstream release
   bookkeeping cannot substitute for this record.
4. Run frozen install, build, complete unit/type/API/boundary gates, packed
   ESM/CJS/declaration consumers, the matching starter branch, and a silent
   rendered browser interaction under exact Node 24.19.0.
5. Obtain a producer-disjoint independent review and merge the exact reviewed
   tree into public GitHub `main`; allow the checked GitHub-to-Gitea backup to
   converge without making Gitea a development authority.
6. Bind the exact hash of that Solo-owned Changeset into the reviewed release
   plan, then create one coherent four-package Solo prerelease derived from
   beta.30. The final suffix is selected by the release transaction and is not
   guessed in this audit. Publish only byte-identical reviewed artifacts, tags,
   releases, registry metadata, and tarballs.

Quest for the Crown may adopt the cohort only after this complete release gate.
The currently published `5.0.0-beta.29.solo.2` packages are newer than Quest's
pin but do not satisfy the accepted beta.30-derived dependency contract.
