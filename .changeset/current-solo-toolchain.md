---
"@jbcom/rpgjs-solo-vite": patch
---

Align the Solo build boundary and the fork's build/test consumers with the
current stable Vite 8 release, and align the repository release workflow with
the current stable pnpm 11 release.

Remove the unreachable VitePress/Cloudflare documentation deployment left
behind by the upstream Mintlify migration, so obsolete build-only dependencies
cannot keep vulnerable transitive packages in the fork.
