# RPGJS Solo `5.0.0-beta.29.solo.2` release transaction

Status: source PR #26 merged to canonical GitHub `main` as
`732d8fb540f89827443939f20d2d102531da8d17` after its exact head passed the
Node 24.19.0 cohort, CodeQL, dependency, audit, build, package, API, type,
runtime, unit, and sample-build gates. This transaction advances the four
`@jbcom/rpgjs-solo*` packages together from `.solo.1` to `.solo.2` and binds
the clean-consumer gate to `@arcade-cabinet/rpgjs-patches@0.3.0`,
CanvasEngine 2.2.0, and Vite 8.2.1.

The machine-readable authority is
[`solo-beta29-solo2.plan.json`](solo-beta29-solo2.plan.json). The historical
Solo 1 plan and evidence are immutable records and are not inputs to this
release.

## Fixed boundary

Only `.changeset/current-solo-canvasengine-2-2.md` is consumed. Every pending
changeset naming the inherited RPGJS release surface is hash-bound and carried
without versioning or deleting it. The release command must never invoke the
repository-wide Changesets version command or advance inherited RPGJS package
versions.

The release CLI runs only with exact Node 24.19.0 and pnpm 11.21.0. Remote
mutation remains a dry run unless both `--execute` and
`RPGJS_SOLO_RELEASE_CONFIRM=5.0.0-beta.29.solo.2` are present. npm credentials
are accepted only through `RPGJS_SOLO_NPM_TOKEN` and the tool's ephemeral,
mode-0600 npm configuration.

## Required sequence

1. Open this release-transition PR from the exact source merge. Bind its PR
   number in the plan, set `reviewEvidence.status` to `final`, and commit that
   final source policy before apply. Producer-controlled source must not name
   the reviewer, reviewer key, assignment, or orchestrator trust key.
2. Run `pnpm release:solo:validate`, then `pnpm release:solo:apply`. Apply must
   deterministically update all four package identities and exact workspace
   references, create their changelogs, consume only the declared Solo
   changeset, and update the lockfile through the owned fail-closed journal.
3. Let the exact applied PR head pass every required check. Resolve every review
   thread, obtain the required independent review evidence, and merge without
   changing reviewed source. CodeRabbit remains advisory on the release PR
   because its external quota made exact-head status nondeterministic during
   this transition. Exact-head Codex review, CodeQL, the full CI gate, and the
   producer-disjoint signed auditor remain mandatory.
4. Work only from the exact canonical GitHub merge. Prove GitHub and Gitea
   `main` equality, the upstream and source ancestry bindings, both PRs,
   required checks, and resolved threads. The supervisor supplies the detached
   mode-0600 trust root, separately pinned key id, and root-signed assignment
   through `RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_PATH`,
   `RPGJS_SOLO_ORCHESTRATOR_TRUST_ROOT_KEY_ID`, and
   `RPGJS_SOLO_ORCHESTRATOR_ASSIGNMENT_PATH`. Only the assigned
   producer-disjoint reviewer may create the post-merge ACCEPT receipt through
   `RPGJS_SOLO_REVIEW_RECEIPT_PATH`.
5. Re-run frozen strict installation, dependency currency and audit, build,
   archive/API/type boundaries, Solo production and packed-consumer contracts,
   the full unit suite, both Cloudflare runtime suites, and every playground and
   sample build.
6. Do not pack or publish until `@arcade-cabinet/rpgjs-patches@0.3.0` is proven
   immutable at the private registry and by an anonymous clean install/fetch.
   That proof must include the exact registry integrity, source/tag identity,
   GitHub release, and Gitea backup release. The plan binds all of those
   identities. Pack, publish, and candidate verification re-read exact
   integrity, shasum, tarball URL, and `latest`, then anonymously fetch and
   compare the tarball SHA-256, SHA-1, and SHA-512 before installing it. The
   wrapper replaces both user and global npm configuration with mode-0600 files
   and runs registry commands from that isolated directory, preventing project,
   user, global, or ambient-environment credentials from authenticating the
   fleet-package proof.
7. Run `pnpm release:solo:pack --artifacts <absolute-directory-outside-repo>`
   once with `RPGJS_SOLO_PROVENANCE_SIGNING_KEY_FILE`. Pack rechecks the bound
   patch metadata through a token-free npm configuration before it creates any
   archive. Retain the exact four archives, schema-3 provenance manifest,
   SHA-512 sidecar, Ed25519 statement and signature, and independent review
   receipt.
8. Publish the exact archive cohort to the candidate tag with
   `pnpm publish:solo --manifest <manifest> --execute`. A partial cohort is a
   resumable transaction, not a successful release. Publish repeats the
   token-free patch-package preflight before creating immutable Solo versions.
9. Run `pnpm release:solo:verify-candidate --manifest <manifest> --execute`.
   It must install the four exact candidate packages plus the exact fleet patch
   package in a fresh workspace-isolated consumer. The npm configuration grants
   credentials only to the private `@jbcom` registry; the fleet patch remains
   anonymous during the real install. The gate then executes the transport-free
   Node surfaces and typechecks and production-builds the renderer/CanvasEngine
   browser surface.
10. Promote only the verified cohort with
    `pnpm release:solo:promote --manifest <manifest> --execute`, then reconcile
    exact GitHub and Gitea tags, releases, and byte-identical assets through
    `pnpm release:solo:publish-releases --manifest <manifest> --execute`.

This package release proves a reusable engine cohort. It does not prove the
Quest game or its authored content complete; that requires its own silent
headed gameplay, narrative, visual, persistence, and deployment evidence.
