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

The public transition has a distinct provisional solo.3 plan. Existing solo.2 artifacts are immutable; applying the reviewed next transaction consumes the public dependency and Solo toolchain Changesets and advances the complete cohort. The inherited toolchain Changeset remains pending for its own release. Historical verification uses the entire original checkout and its original trust schema.

## Current dependency and test runtime

The workspace uses pnpm 12.10.1, CanvasEngine 2.4, Vite 8.3, and Vitest 5.
The currency gate retains its existing intentional major boundaries and the
low-severity audit remains mandatory. Vulnerable transitive versions are
replaced with patched versions through bounded workspace overrides.

The currency checker validates both pnpm 12 lockfile documents, rejecting
duplicate keys in either, and enumerates importers only from the project
document after validating the config-dependency or package-manager environment
document.

Cloudflare's Vitest pool only supports Vitest 4, so sample integration tests
use Wrangler's public `createTestHarness()` API instead. The same request and
WebSocket assertions run against built Workers in real workerd; each test
resets storage and the suite closes its runtime. No peer compatibility rules
or test assertions are bypassed.

Studio compiles its canonical Ajv schemas during module initialization. Both
its deployment and test configurations enable Cloudflare's supported
[`allow_eval_during_startup`](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#enable-eval-during-startup)
flag for this initialization. Request-time dynamic code generation remains
disabled. This matches the production runtime rather than the previous test
pool's unrestricted eval facility.
