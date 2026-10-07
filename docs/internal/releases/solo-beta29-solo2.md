# RPGJS Solo `5.0.0-beta.29.solo.2` release transaction

Status: source PR #26 merged to canonical GitHub `main` as
`732d8fb540f89827443939f20d2d102531da8d17` after its exact head passed the
Node 24 cohort, CodeQL, dependency, audit, build, package, API, type,
runtime, unit, and sample-build gates. This transaction advances the four
`@jbcom/rpgjs-solo*` packages together from `.solo.1` to `.solo.2` and binds
the clean-consumer gate to `rpgjs-patches@^0.4.0`,
CanvasEngine 2.2.0, and Vite 8.2.1.

Historical release-transition PR #27 merged as
`013d59e4d5d619ad11ceb3df405ea6d6a987ed94`, but its independent post-merge
audit rejected that exact merge: the Cloudflare MMORPG sample retained stale
esbuild 0.28.1, and the documented
`mise exec node@24 -- pnpm verify:published-package-contracts` route failed
when pnpm's `manage-package-manager-versions` setting leaked into child npm.
No independent ACCEPT receipt was created. The rejected plan's exact raw-byte
SHA-512 is
`a3ed4697a604bf6f47ebdd8c562010719e0c65aae2eb16f40852923b0f73dd7bc33fe3fb741223cbdd1f82952fe8ade1074d178bd0cdfe508b9924b207f11a23`;
neither it nor PR #27 authorizes repaired bytes. Additive repair PR #28, named
in the plan, is the only release-transition authority for this cohort after it
passes exact-head review, merges, and receives a new producer-disjoint
post-merge audit assignment.

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

The release CLI runs only with exact Node 24 and pnpm 11.21.0. Remote
mutation remains a dry run unless both `--execute` and
`RPGJS_SOLO_RELEASE_CONFIRM=5.0.0-beta.29.solo.2` are present. npm credentials
are accepted only through `RPGJS_SOLO_NPM_TOKEN` and the tool's ephemeral,
mode-0600 npm configuration.

## Required sequence

1. Use release-transition repair PR #28 from exact canonical merge
   `013d59e4d5d619ad11ceb3df405ea6d6a987ed94`. Its number and final source
   policy are bound in the plan. Producer-controlled source must not name the
   reviewer, reviewer key, assignment, or orchestrator trust key.
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
4. Work only from the exact canonical GitHub merge. Prove local/GitHub
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
6. Verify `rpgjs-patches@0.4.0` anonymously against npmjs and
   [its GitHub source](https://github.com/jbcom/rpgjs-patches). The consumer
   dependency range is `^0.4.0`; release evidence pins the exact tarball URL,
   SHA-256, SHA-1, SHA-512, source commit, and tag. Isolated mode-0600 user and
   global npm configurations keep the artifact proof anonymous.
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
   It installs the Solo cohort and public patch dependency in a fresh
   workspace-isolated consumer, executes the transport-free Node surfaces,
   and typechecks and production-builds the browser integration.
10. Promote only the verified cohort with
    `pnpm release:solo:promote --manifest <manifest> --execute`, then reconcile
    exact GitHub tags, releases, and byte-identical assets through
    `pnpm release:solo:publish-releases --manifest <manifest> --execute`.

This package release proves a reusable engine cohort. Application gameplay and
authored content require separate silent headed-browser evidence.
