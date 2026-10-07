# Solo beta.29 solo.3 public transition

The public dependency migration targets `5.0.0-beta.29.solo.3`, with the exact
beta.29 upstream baseline retained. The CLI defaults to the provisional
`solo-beta29-solo3.plan.json`; it cannot publish these changed bytes under the
already published solo.2 identity.

Source manifests remain at solo.2 until the reviewed release transaction is
applied. That transaction consumes `public-patch-consumer` and advances all four
Solo manifests, workspace references, changelogs, and the lockfile together to
solo.3. Packing and publication require the applied solo.3 cohort.

Before application, bind the exact canonical PR #34 merge, a separate release
transition review, a producer-disjoint independent receipt, and the new signing
key. Provisional bindings fail closed. This preparation creates no tag, release,
or publication.

Use Node 24.15 or later in major 24, or Node 26, and the committed pnpm version.
The required consumer declares public npm `rpgjs-patches ^0.4.0` and verifies the
reviewed 0.4.0 artifact using an exact consumer override and npmjs integrity
evidence. Publication requires public access and npm provenance in supported CI.

Historical releases must be verified using their complete original checkout,
including its original plan and trust schema. Current neutral signature schemas
do not reinterpret old evidence.
