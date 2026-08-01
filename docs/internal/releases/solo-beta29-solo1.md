# RPGJS Solo `5.0.0-beta.29.solo.1` release transaction

Status: tooling prepared on the reviewed `98bdb58` base. Publication remains
blocked until PR #20, including `f014412`, is merged and this branch is rebased
onto that exact canonical GitHub `main` history.

## Fixed boundary

This is one coordinated four-package release. It advances only the Solo counter
from `.solo.0` to `.solo.1`; it must never invoke the repository-wide
Changesets version command or move inherited `@rpgjs/*` packages to beta.30.
The machine-readable authority is
[`solo-beta29-solo1.plan.json`](solo-beta29-solo1.plan.json).

The planner consumes five Solo-owned changesets: the beta.29 baseline, atomic
Solo runtime, reactive renderer props, current Solo toolchain, and this release
transaction. It hash-binds but retains the inherited action-battle/client/fork
toolchain changesets and the Studio percentage fix. Any new pending changeset
that names a Solo package, `@rpgjs/action-battle`, `@rpgjs/client`, or
`@rpgjs/studio` is a hard failure until the plan is reviewed.

## Required sequence

Use Node 24 and repository-pinned pnpm 11.18.0. Every mutating remote phase is a
dry run unless both `--execute` and
`RPGJS_SOLO_RELEASE_CONFIRM=5.0.0-beta.29.solo.1` are present. The npm token is
read only from `RPGJS_SOLO_NPM_TOKEN`, written to a mode-0600 temporary npmrc,
never logged, and deleted in `finally`.

1. Rebase this tooling commit onto merged PR #20 and run `pnpm release:solo:validate`.
2. Run `pnpm release:solo:apply`, commit the deterministic version/changelog/lock transition, and merge it through reviewed GitHub PR checks.
3. From clean canonical GitHub `main`, build and run the complete Solo package, boundary, consumer, type, and test gates.
4. Run `pnpm release:solo:pack --artifacts <absolute-directory-outside-repository>` once. Retain those exact archives, manifest, and SHA-512 sidecar.
5. Run `pnpm publish:solo --manifest <absolute-provenance-path> --execute`; it publishes or verifies each exact archive under the candidate tag in dependency order.
6. Run `pnpm release:solo:verify-candidate --manifest <absolute-provenance-path> --execute`; it verifies registry integrity and installs the exact cohort with `@arcade-cabinet/rpgjs-patches@0.2.0` in a fresh authenticated consumer.
7. Run `pnpm release:solo:promote --manifest <absolute-provenance-path> --execute`; preflight must pass for the entire cohort. A journal beside the manifest records previous tags and each completed `latest` update so an interruption is detectable and safely resumable.
8. Run `pnpm release:solo:publish-releases --manifest <absolute-provenance-path> --execute`; package and train tags must point at the manifest source commit. GitHub is tagged and released first. Gitea receives the same tags and an identical manifest, sidecar, tarballs, and release-note bytes as backup.

The tool asserts a clean `main`, exact local/GitHub/Gitea head equality, ancestry
from `f014412`, exact upstream `2fab01f`, lockfile and plan hashes, and archive
SHA-512 values before every irreversible phase. A partial registry publish or
promotion is not called atomic: the candidate tag and journal make it
resumable without silently accepting foreign bytes or an unexpected `latest`.

No package publication, tag, release, or backup update proves the downstream
Quest game feature-complete. That remains a separate authored-content and
headed, permanently silent gameplay evidence boundary.
