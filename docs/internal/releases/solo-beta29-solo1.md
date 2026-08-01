# RPGJS Solo `5.0.0-beta.29.solo.1` release transaction

Status: tooling rebased onto the exact canonical, two-parent PR #20 merge
`82a9e56d106e87c37df4602055a6a22ec22218dc`, with release PR #22 and the
release-scoped provenance public key bound in the plan. Publication remains
blocked until this release PR carries its deterministic apply transition,
passes every required check, receives the detached producer-disjoint review
receipt, and is merged without changing the reviewed release source.
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

1. PR #20 is merged and this release branch is based on its exact canonical merge. Both source bindings carry that merge SHA; recompute all final carry and changeset hashes whenever the reviewed source changes before apply.
2. Open the release-transition PR from this rebased branch. While that same PR is still open, bind its exact PR number and the trusted provenance Ed25519 public key in the plan, then set the source, review, external-assignment policy, and attestation statuses to `final`. The producer-controlled plan must not contain or select a reviewer identity, reviewer key, assignment, or orchestrator trust key.
3. Still on the same open release PR branch and with the now-final plan committed, run `pnpm release:solo:validate`, then `pnpm release:solo:apply`. Validate explicitly lists and rejects every provisional source, review, independent-receipt, assignment-policy, or provenance binding. Commit the deterministic manifest/changelog/deletion/lock transition to that PR. Apply computes every target and the lockfile from exact `HEAD`, records regular-file modes and hashes, and uses an owned mode-0600 journal plus exclusive no-follow temporary files. Security-sensitive JSON is parsed from bytes read through its already-validated descriptor. Every journal, marker, payload, source, and target must have exactly one hard link. Retrying recovers proven state before or after rename; unmarked, mismatched, replayed, linked, or otherwise unverifiable lookalikes fail closed and remain untouched for investigation. Cleanup is non-recursive and occurs only after exact ownership and content proof.
4. Let that PR complete all required checks and review, resolve every review thread, and merge it. Do not edit release source or the plan after merge. From exact canonical GitHub `main`, prove the engine and release PR identities, exact two-parent merge ancestry, successful required checks, and resolved threads. Before either lawful GitHub approval or a receipt is trusted, an independent supervisor supplies a mode-0600 trust root outside the repository through `RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_PATH`, pins its declared SHA-256 key fingerprint separately through `RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_KEY_ID`, and supplies its root-signed detached assignment through `RPGJS_SOLO_ORCHESTRATOR_ASSIGNMENT_PATH`. The verifier accepts the fleet's normative `arcade-cabinet.orchestrator-trust-root/v1` representation by canonically decoding its 32 raw Ed25519 bytes and hashing exactly those bytes; the legacy local SPKI representation remains supported only with its corresponding SPKI fingerprint. That assignment binds this release/version, producer task/principal, reviewer task/principal/role/fork, and the reviewer key fingerprint. If a single owner cannot self-approve, only that assigned reviewer creates the detached Ed25519 `ACCEPT` receipt after merge through `RPGJS_SOLO_REVIEW_RECEIPT_PATH`; the receipt binds both merge SHAs, immutable plan hash, external assignment SHA-512, and trust-root fingerprint. Creating these detached inputs does not require a source commit.
5. Build and run the complete Solo package, boundary, consumer, type, lint, and test gates from clean canonical `main`.
6. Run `pnpm release:solo:pack --artifacts <absolute-directory-outside-repository>` once. It preflights the output, deletes all four ignored `dist` trees, clean-builds the cohort, and proves every conditional export target from every archive before writing provenance. The manifest is schema 3, binds the complete packed `package.json` used for publication, and is covered by a detached Ed25519 attestation using `RPGJS_SOLO_PROVENANCE_SIGNING_KEY_FILE`; any independent review receipt is copied into and hash-bound within the artifact set. Retain those exact archives, manifest, SHA-512 sidecar, attestation statement and signature, and review receipt when present.
7. Run `pnpm publish:solo --manifest <absolute-provenance-path> --execute`; it distinguishes a verified registry package/version-not-found response (including a registry 404) from authentication, transport, and server errors and read-only preflights the complete cohort before local or remote mutation. For every missing candidate package, it opens the provenance archive once with no-follow, regular-file, single-link, inode, SHA-512, and SRI checks, reads the verified bytes through that descriptor, and hands that exact in-memory `Buffer` plus a clone of the fully bound packed manifest directly to `libnpmpublish`. No mutable archive pathname is reopened by the publisher, so a later same-UID replacement cannot change the command input. A mode-0600 journal binds the manifest and completion state for fail-closed recovery; registry fetch-back remains the secondary post-publication proof.
8. Run `pnpm release:solo:verify-candidate --manifest <absolute-provenance-path> --execute`; it verifies registry integrity and installs the exact cohort with `@arcade-cabinet/rpgjs-patches@0.2.0` in a fresh authenticated consumer.
9. Run `pnpm release:solo:promote --manifest <absolute-provenance-path> --execute`; preflight must pass for the entire cohort. Every existing `latest` must be absent, equal to the target, or an older well-formed Solo prerelease; promotion refuses stable, malformed, or newer tags. A secure owned journal beside the manifest records previous tags and each completed `latest` update so an interruption is detectable and safely resumable. Once an entry is complete, a later retry refuses to overwrite a deliberate live rollback.
10. Run `pnpm release:solo:publish-releases --manifest <absolute-provenance-path> --execute`; it rechecks the live registry `latest` value for every package rather than trusting the promotion journal. Package and train tags must point at the manifest source commit. GitHub and Gitea are reconciled independently, so a completed GitHub release is verified and reused after a later Gitea failure. Each new source release remains a draft while existing assets are authenticated and verified, missing assets are uploaded, and the complete set is fetched back and hash-verified byte for byte; only then is the release published and verified again. This ordering is compatible with GitHub immutable releases and resumes safely after upload or publish-response interruption.

The tool asserts a clean `main`, exact local/GitHub/Gitea head equality, the
`sourceBaseCommit -> requiredSourceCommit -> release HEAD` ancestry chain,
ancestry from every carried `introducedBy` commit, exact upstream `2fab01f`,
lockfile and plan hashes, and archive SHA-512 values before every irreversible
phase. Every manifest load also re-extracts every archive, rechecks package
identity, repository, engine, dependency, export metadata, and every public
export target. Before parsing any manifest-controlled path or reading any
receipt/archive, it verifies the plan-anchored detached signature over the raw
manifest bytes captured from the validated descriptor; the sidecar is then
checked as additional operator evidence. A
partial registry publish, promotion, or two-remote source release is
not called atomic: live reconciliation plus byte-bound journals make each phase
resumable without silently accepting foreign bytes or an unexpected `latest`.

No package publication, tag, release, or backup update proves the downstream
Quest game feature-complete. That remains a separate authored-content and
headed, permanently silent gameplay evidence boundary.
