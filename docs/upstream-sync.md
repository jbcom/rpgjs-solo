# Upstream synchronization

RPGJS Solo is a source fork, not a snapshot. It keeps an auditable relationship
to `RSamaium/RPG-JS:v5` without allowing the upstream dual-runtime product to
silently re-enter Solo.

## Branch contract

| Branch | Purpose | Allowed changes |
|---|---|---|
| `v5` | Exact upstream-tracking line | Fast-forwarded upstream commits only |
| `main` | GitHub-canonical RPGJS Solo product | Reviewed Solo and deliberately ported upstream work |
| feature branches | One reviewable change | Focused work based on `main` |

## Audit procedure

```bash
git fetch upstream v5
git fetch origin v5 main
git fetch gitea v5 main
git rev-list --left-right --count origin/v5...upstream/v5
git log --oneline origin/v5..upstream/v5
```

For every new upstream range:

1. record the old and new upstream hashes;
2. review package manifests, changesets, changelogs, tests, and generated API
   output—not only commit subjects;
3. classify each relevant change as portable, adaptable, or excluded under ADR
   005;
4. fast-forward the fork's `v5` branch to the audited upstream commit;
5. port or merge the selected changes to a feature branch based on `main`;
6. run frozen install, build, unit tests, Solo boundary audits, and the real-game
   compatibility lane; and
7. record the adopted upstream hash in the Solo release notes.

Never resolve a sync by merging `main` back into `v5`, force-pushing either
branch, or accepting dependency-version changes without their behavior and test
changes.

Solo commits should also remain easy to classify during a sync. Prefer new
files and packages, compatibility re-exports, and release-graph exclusions.
Avoid broad inherited-file edits, moves, renames, or formatting churn. If an
upstream file must change, isolate that patch from Solo-only additions so it can
be replayed or dropped independently. RPGJS Solo does not submit changes back
to upstream.

## Repository topology

`https://github.com/jbcom/rpgjs-solo` is the canonical public repository.
`https://git.local.jonbogaty.com/jbcom/rpgjs-solo` is a checked downstream
backup and hosts the private `@jbcom` package registry. The Mini's no-force
synchronization service must run in `github-to-gitea` mode so GitHub refs may
advance Gitea but Gitea never becomes an independent development authority.
Any divergence alerts and stops for manual reconciliation.

## Current baseline

| Audited on | Upstream branch | Commit | Release tags | Classification |
|---|---|---|---|---|
| 2026-07-22 | `v5` | `e286ecf18ad85d5fab38b659ab95758a7f7a7c96` | action-battle/client/server/testing/tiledmap/vite `5.0.0-beta.26`; common `5.0.0-beta.25` | Initial fork baseline |
| 2026-07-30 | `v5` | `c858081051a18bc9410cb2f78deafcc31a40f07f` | action-battle/client/server/testing/tiledmap/vite/vue `5.0.0-beta.28`; common `5.0.0-beta.26`; Studio `5.0.0-beta.30`; UI CSS `5.0.0-beta.24` | Adopted by one upstream merge; Solo packages remain additive |
| 2026-07-31 | `v5` | `2fab01fb8e93ad13902b07db28935f058b387213` | action-battle/client/server/testing/tiledmap/vite/vue `5.0.0-beta.29`; common `5.0.0-beta.27`; Studio `5.0.0-beta.31`; UI CSS `5.0.0-beta.25`; chat `5.0.0-beta.2` | Exact GitHub `v5` tracking fast-forward complete; product merge candidate locally green; independent review, main adoption, and Solo release pending |

### `e286ecf1..c8580810` compatibility ledger

- **Portable:** CanvasEngine 2.1 compatibility, recursive provider
  initialization, public API declaration gates, UI CSS themes, Studio database
  preservation, and inherited package/test fixes.
- **Adaptable:** server-step metrics, pure Studio map and terrain transforms,
  and renderer-neutral GUI registrations. Solo implementations must use direct
  local state and commands.
- **Excluded from Solo publication:** the embedded `provideRpg()` bridge, Signe
  rooms and synchronization, Node and Cloudflare transports, prediction,
  reconciliation, and the client/server chat transport. These remain in the
  inherited upstream source as compatibility and audit inputs only.

### Downstream package stewardship blocker

The public renderer exposes a typed `installCanvasEnginePatches` injection
boundary instead of depending on the fleet's private registry. Fleet production
consumers must inject a validated private release with an exact compatible
CanvasEngine peer. The 2.2 cohort requires
`@arcade-cabinet/rpgjs-patches@0.3.0` with exact `canvasengine@2.2.0`; the Solo
line is not fleet-release-complete until that immutable package is merged,
published, anonymously fetched, and proved in a real LAN game consumer.

### 2026-08-09 CanvasEngine 2.2 and current-toolchain overlay

The upstream RPGJS baseline remains `2fab01fb`; this is a deliberately separate
fork-owned compatibility overlay rather than a fabricated upstream sync. The
complete 32-importer workspace advances to Node `24.19.0`, pnpm `11.21.0`, Vite
`8.2.1`, and CanvasEngine/compiler/presets/Tiled/testing `2.2.0`.

CanvasEngine 2.2 made two previously implicit boundaries observable during the
full source build. `@rpgjs/vite` now declares its public `rpgjs()` result as
Vite `Plugin[]`, preventing CanvasEngine compiler-private `CompileMetadata`
from entering the emitted declaration. Studio also keeps quote-bearing ObjectId
patterns in JavaScript strings because CanvasEngine's SFC block scan does not
interpret regular-expression literals while locating `</script>`. Both changes
are small, isolated compatibility adaptations and leave the inherited product
architecture intact.

`@jbcom/rpgjs-solo-renderer` exports
`rpgjsSoloRendererCompatibility` as the machine-readable admission record. It
retains the public, consumer-owned injection seam and records the exact private
patch package without importing private registry code into this public fork.

### `c8580810..2fab01fb` audited product candidate

The beta.29 line arrived after the beta.28 Solo source and toolchain work had
passed exact-main checks. Therefore `5.0.0-beta.28.solo.1` must not be published
or promoted to the private registry's `latest` tag. The current-underlying rule
requires beta.29 adoption first.

The fixed audit range contains 17 implementation commits followed by three
release-bookkeeping commits (release metadata, public-API snapshot, and release
trigger). Its principal changes are generic hotbars; item and
skill Studio workflows; Action Battle defense, control, targeting, projectile,
audio, AI-planning, boss-phase, and serializable-visual work; GUI visibility;
sprite-alpha bounds; and associated documentation and tests.

- **Portable into the inherited compatibility source:** exact upstream package
  versions and changelogs, public API type coverage, item/skill schemas and
  lifecycle tests, GUI visibility repair, spritesheet bounds, Studio data
  normalization and placement fixes, and all upstream tests that describe those
  behaviors.
- **Adaptable into Solo after separate API design:** control-state, defense,
  hit, cooldown, targeting, audiovisual description, and generic hotbar
  concepts. Solo Action Battle owns command availability and execution, not AI
  decision authority.
- **Routed to the existing Yuka governor seam:** combat-planning and boss-phase
  semantics are gap-audited into downstream
  `@arcade-cabinet/ai-yuka@0.18.0`. The upstream behavior-tree and `RpgPlayer`
  implementation is excluded from Solo execution. Solo does not depend on
  Yuka; governors consume the same public command/proposal contract as human
  controls.
- **Excluded from Solo production bundles:** rooms, sockets, synchronized
  client replicas, server-driven transport, multiplayer chat, prediction,
  reconciliation, and any `@signe/room`, `@signe/sync`, WebSocket, Hono server,
  Node transport, or Cloudflare room dependency. They may remain in inherited
  upstream packages as audited compatibility source only.

The merge is expected to conflict in four inherited manifests,
`packages/studio/src/server.ts`, and `pnpm-lock.yaml`. Resolutions must take the
beta.29 inherited package identities and behavior while retaining the fork's
newer exact Node 24.19.0/pnpm 11.21.0/Vite/declaration toolchain, direct-dependency currency,
Hono exclusion, Solo packages, GitHub authority, and production-boundary gates.
The lockfile is regenerated; it is never resolved by choosing one parent.

Product adoption is not complete until the merge head passes the complete Node
24 lane, a producer-disjoint review, the upstream matching-branch starter
consumer test, and a silent rendered Solo browser test. Only then may the ADR,
Solo package baseline, and coordinated release plan advance to beta.29.

### Fork workflow containment

The exact `v5` branch necessarily contains upstream's own workflow files. Those
files are source-audit inputs, not trusted fork automation. In particular, an
upstream push workflow may use an old Node line or attempt upstream package
publication when it runs in a fork.

The inherited workflow at `.github/workflows/ci.yml` is disabled through the
GitHub repository workflow setting. It must remain disabled even when its bytes
look safe on `main`, because a later exact `v5` fast-forward can replace those
bytes without a fork review.

Fork validation lives at the distinct `.github/workflows/fork-ci.yml` path on
canonical `main`. It has read-only permissions, exact Node 24.19.0, the complete Solo gate,
no versioning or publishing job, and a required `workflow_dispatch` commit input
for validating an exact tracking SHA. Every future `v5` fast-forward follows
this order:

1. confirm the update is a strict fast-forward to the intended upstream SHA;
2. confirm the inherited `CI` workflow remains disabled;
3. push the exact tracking ref;
4. dispatch `Fork CI` from canonical `main` with that 40-character SHA;
5. require the checkout and reported head to equal the requested SHA; and
6. do not begin product adoption until that exact-SHA run passes.

The scheduled `Upstream audit` workflow only reports tracking distance. It does
not substitute for the explicit commit build or grant publication authority.
