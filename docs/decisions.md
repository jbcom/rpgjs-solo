# Public package dependencies

RPGJS Solo consumers use `rpgjs-patches@^0.4.0` from npmjs and its public
[source repository](https://github.com/jbcom/rpgjs-patches). The renderer retains
its typed application-owned injection seam. Release verification binds the exact
0.4.0 npm artifact hashes and GitHub tag, independently of that dependency range.
The release consumer uses a pnpm override to install those exact reviewed bytes
while keeping the application's declared dependency range visible.

The release reviewer signature mechanism remains because it binds an independent
reviewer to the exact release, source, and plan. Its raw Ed25519 trust-root schema
is now named for RPGJS Solo. Fingerprint, ownership, detached-signature, and
producer/reviewer separation checks remain enforced. The private backup release
adapter and its adapter-specific tests have been removed; GitHub is authoritative.

Node 24 and 26 are supported by major version. The pnpm child must use the same
Node runtime as the invoking process; no exact Node patch release is required. Release tooling requires Node 24.15
or newer within the 24 major because libnpmpublish 12 declares that minimum.
Public access and npm provenance are passed explicitly to the programmatic
publisher. Historical signed plans remain available through immutable Git
checkouts; sanitization must never be mistaken for replacing historical evidence.
Publication requires a CI environment supported by npm provenance. A local shell
is suitable for validation and packing, and must not bypass that requirement.

The public transition has a distinct provisional solo.3 plan. Existing solo.2 artifacts are immutable; applying the reviewed next transaction consumes the public dependency Changeset and advances the complete cohort. Historical verification uses the entire original checkout and its original trust schema.
