# RPGJS Solo `5.0.0-beta.29.solo.1` release transaction

Status: tooling prepared on the reviewed `98bdb58` base. Publication remains
blocked until PR #20, including `f014412`, is merged and this branch is rebased
onto that exact canonical GitHub `main` history. At that point both
`sourceBaseCommit` and `requiredSourceCommit` in the plan must be replaced with
the real PR #20 merge commit and `sourceBinding.status` changed from
`provisional` to `final`. The value is intentionally not guessed here.
`fair-studio-success-rates.introducedBy` remains its own immutable `f014412...`
commit and is verified as an ancestor of the required source instead of being
made equal to it.

## Fixed boundary

This is one coordinated four-package release. It advances only the Solo counter
from `.solo.0` to `.solo.1`; it must never invoke the repository-wide
Changesets version command or move inherited `@rpgjs/*` packages to beta.30.
The machine-readable authority is
[`solo-beta29-solo1.plan.json`](solo-beta29-solo1.plan.json).

The planner consumes five Solo-owned changesets: the beta.29 baseline, atomic
Solo runtime, reactive renderer props, current Solo toolchain, and this release
transaction. It hash-binds but retains the inherited changesets. Release
relevance is derived from the four cohort records plus the package manifests in
`inheritedReleaseDirectories`: common, server, client, action battle, Studio,
Tiled, and Vite. Any new pending changeset that names that complete surface is a
hard failure until the plan is reviewed.

## Required sequence

The CLI refuses to start unless it is running on Node 24 with exactly the
repository-pinned pnpm 11.18.0. Every mutating remote phase is a dry run unless
both `--execute` and
`RPGJS_SOLO_RELEASE_CONFIRM=5.0.0-beta.29.solo.1` are present. The npm token is
read only from `RPGJS_SOLO_NPM_TOKEN`, written to a mode-0600 temporary npmrc,
never logged, and deleted in `finally`.

1. Rebase this tooling commit onto merged PR #20, replace both provisional source bindings with the exact merge commit, set the binding status to `final`, recompute every changeset hash after the final PR #20 changes land, and run `pnpm release:solo:validate`. Also finalize both trusted Ed25519 public-key records; private signing keys remain outside the repository.
2. Run `pnpm release:solo:apply`, commit the deterministic version/changelog/lock transition, and merge it through GitHub PR checks. Before the first write, apply computes every target manifest, changelog, deletion, and the target lockfile in an isolated checkout of exact `HEAD`; an atomic journal hash-binds all source and target bytes. A retry accepts each output only at its exact source or target state and resumes after any completed boundary. Foreign bytes fail closed.
3. From clean canonical GitHub `main`, build and run the complete Solo package, boundary, consumer, type, and test gates. Finalize the release-PR binding in the plan. Publication then proves both PR identities, their exact two-parent merges, every required successful check, and zero unresolved review threads. When GitHub has lawful independent approvals, those are used. When a single owner cannot self-approve, a trusted producer-disjoint Ed25519 `ACCEPT` receipt must instead bind both PR merges and the exact plan hash through `RPGJS_SOLO_REVIEW_RECEIPT_PATH`.
4. Run `pnpm release:solo:pack --artifacts <absolute-directory-outside-repository>` once. It preflights the output, deletes all four ignored `dist` trees, clean-builds the cohort, and proves every conditional export target from every archive before writing provenance. The manifest is schema 2 and covered by a detached Ed25519 attestation using `RPGJS_SOLO_PROVENANCE_SIGNING_KEY_FILE`; any independent review receipt is copied into and hash-bound within the artifact set. Retain those exact archives, manifest, SHA-512 sidecar, attestation statement and signature, and review receipt when present.
5. Run `pnpm publish:solo --manifest <absolute-provenance-path> --execute`; it distinguishes a verified registry package/version-not-found response (including a registry 404) from authentication, transport, and server errors, read-only preflights the complete cohort, then publishes or verifies each exact archive under the candidate tag in dependency order.
6. Run `pnpm release:solo:verify-candidate --manifest <absolute-provenance-path> --execute`; it verifies registry integrity and installs the exact cohort with `@arcade-cabinet/rpgjs-patches@0.2.0` in a fresh authenticated consumer.
7. Run `pnpm release:solo:promote --manifest <absolute-provenance-path> --execute`; preflight must pass for the entire cohort. Every existing `latest` must be absent, equal to the target, or an older well-formed Solo prerelease; promotion refuses stable, malformed, or newer tags. A journal beside the manifest records previous tags and each completed `latest` update so an interruption is detectable and safely resumable. Once an entry is complete, a later retry refuses to overwrite a deliberate live rollback.
8. Run `pnpm release:solo:publish-releases --manifest <absolute-provenance-path> --execute`; it rechecks the live registry `latest` value for every package rather than trusting the promotion journal. Package and train tags must point at the manifest source commit. GitHub and Gitea are reconciled independently, so a completed GitHub release is verified and reused after a later Gitea failure. Each new source release remains a draft while existing assets are authenticated and verified, missing assets are uploaded, and the complete set is fetched back and hash-verified byte for byte; only then is the release published and verified again. This ordering is compatible with GitHub immutable releases and resumes safely after upload or publish-response interruption.

The tool asserts a clean `main`, exact local/GitHub/Gitea head equality, the
`sourceBaseCommit -> requiredSourceCommit -> release HEAD` ancestry chain,
ancestry from every carried `introducedBy` commit, exact upstream `2fab01f`,
lockfile and plan hashes, and archive SHA-512 values before every irreversible
phase. Every manifest load also re-extracts every archive, rechecks package
identity, repository, engine, dependency, export metadata, and every public
export target, then verifies the manifest sidecar and detached attestation. A
partial registry publish, promotion, or two-remote source release is
not called atomic: live reconciliation plus byte-bound journals make each phase
resumable without silently accepting foreign bytes or an unexpected `latest`.

No package publication, tag, release, or backup update proves the downstream
Quest game feature-complete. That remains a separate authored-content and
headed, permanently silent gameplay evidence boundary.
