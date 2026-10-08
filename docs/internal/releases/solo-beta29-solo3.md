# Solo beta.29 solo.3 public transition

The public dependency migration targets `5.0.0-beta.29.solo.3`, with the exact
beta.29 upstream baseline retained. The CLI defaults to the provisional
`solo-beta29-solo3.plan.json`; it cannot publish these changed bytes under the
already published solo.2 identity.

Source manifests remain at solo.2 until the reviewed release transaction is
applied. That transaction consumes `public-patch-consumer` and advances all four
Solo manifests, workspace references, changelogs, and the lockfile together to
solo.3. Packing and publication require the applied solo.3 cohort.

Before application, bind the exact canonical PR #35 merge, a separate release
transition review, a producer-disjoint independent receipt, and the new signing
key. Provisional bindings fail closed. This preparation creates no tag, release,
or publication.

Use Node 24.15 or later in major 24, or Node 26, and the committed pnpm version.
The required consumer declares public npm `rpgjs-patches ^0.4.0` and verifies the
reviewed 0.4.0 artifact using an exact consumer override and npmjs integrity
evidence. Publication requires public access and npm provenance in supported CI.

The manual release workflow uses GitHub-hosted runners, Node 24, npm 11.21 or
later, `id-token: write`, and no npm token fallback. Its protected environment
is `npm-release`, restricted to `main`. A successful `pack` dispatch uploads a
90-day `solo-release-artifacts` artifact containing the signed provenance
manifest, its sidecar and attestation, any independent receipt, and the packed
archives. Later dispatches accept only that producing Actions run ID, restore
the artifact, and re-hash the manifest and archives before acting. The source
release reconciliation is a separate `contents: write` job; OIDC publishing
never receives Git or GitHub write permission. npm trusted-publisher
configuration must bind every unscoped package to `jbcom/rpgjs-solo` and
`solo-release.yml`.

The plan also binds the `latest` value for every package before promotion. For
this first unscoped cohort, every baseline is `null`. A fresh promotion refuses
if any live tag differs from that plan value, and an interrupted promotion
without its same-run journal refuses rather than adopting a later registry
state. This keeps a retry from treating an outside dist-tag change as its own.

The four unscoped names do not yet exist on npm, so neither `npm trust` nor
`npm stage publish` can configure their first release: both commands require an
existing package. After this reviewed plan and its packed artifacts exist, the
owner must perform the one-time direct 2FA publish for each package, then run
`npm trust github <package> --repo jbcom/rpgjs-solo --file solo-release.yml
--env npm-release --allow-publish`. Later releases may use the workflow's OIDC
route and staged publishing if its trust permission is added. This is a release
gap, not evidence that the archive consumer is registry-backed.

Historical releases must be verified using their complete original checkout,
including its original plan and trust schema. Current neutral signature schemas
do not reinterpret old evidence.
