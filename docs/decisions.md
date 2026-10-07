# Public package dependencies

RPGJS Solo consumers use `rpgjs-patches@^0.4.0` from npmjs and its public
[source repository](https://github.com/jbcom/rpgjs-patches). The renderer retains
its typed application-owned injection seam. Release verification binds the exact
0.4.0 npm artifact hashes and GitHub tag, independently of that dependency range.

The release reviewer signature mechanism remains because it binds an independent
reviewer to the exact release, source, and plan. Its raw Ed25519 trust-root schema
is now named for RPGJS Solo. Fingerprint, ownership, detached-signature, and
producer/reviewer separation checks remain enforced. The private backup release
adapter and its adapter-specific tests have been removed; GitHub is authoritative.

Node 24 and 26 are supported by major version. The pnpm child must use the same
Node runtime as the invoking process; no exact Node patch release is required.
