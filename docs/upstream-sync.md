# Upstream synchronization

RPGJS Solo is a source fork, not a snapshot. It keeps an auditable relationship
to `RSamaium/RPG-JS:v5` without allowing the upstream dual-runtime product to
silently re-enter Solo.

## Branch contract

| Branch | Purpose | Allowed changes |
|---|---|---|
| `v5` | Exact upstream-tracking line | Fast-forwarded upstream commits only |
| `main` | Gitea-canonical RPGJS Solo product | Reviewed Solo and deliberately ported upstream work |
| feature branches | One reviewable change | Focused work based on `main` |

## Audit procedure

```bash
git fetch upstream v5
git fetch origin v5 main
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

`https://git.local.jonbogaty.com/jbcom/rpgjs-solo` is the canonical repository.
`https://github.com/jbcom/rpgjs-solo` is a public downstream mirror. The Mini's
existing no-force synchronization service propagates fast-forwards and tags;
any divergence alerts and stops. Do not resolve divergence by choosing GitHub
over Gitea.

## Current baseline

| Audited on | Upstream branch | Commit | Release tags | Classification |
|---|---|---|---|---|
| 2026-07-22 | `v5` | `e286ecf18ad85d5fab38b659ab95758a7f7a7c96` | action-battle/client/server/testing/tiledmap/vite `5.0.0-beta.26`; common `5.0.0-beta.25` | Initial fork baseline |
