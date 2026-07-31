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
CanvasEngine peer. `@arcade-cabinet/rpgjs-patches@0.2.0` is the candidate for
the adopted `canvasengine@2.1.1` baseline; the Solo line is not
fleet-release-complete until that package is merged, published, and proved in a
real LAN game consumer.
