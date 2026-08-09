# @jbcom/rpgjs-solo-action-battle

## 5.0.0-beta.29.solo.2

- Align the complete Solo cohort with Node 24.19.0, pnpm 11.21.0, Vite 8.2.1, and
CanvasEngine/compiler/presets/Tiled 2.2.0. Publish an exact renderer
compatibility record for consumer-injected
`@arcade-cabinet/rpgjs-patches@0.3.0`, keep the installer ahead of scene
bootstrap, and prevent CanvasEngine compiler-private metadata from leaking
through the RPGJS Vite plugin declaration boundary.
  (current-solo-canvasengine-2-2)

## 5.0.0-beta.29.solo.1

- Align the Solo build boundary and the fork's build/test consumers with the
current stable Vite 8 release, and align the repository release workflow with
the current stable pnpm 11 release.

Remove the unreachable VitePress/Cloudflare documentation deployment left
behind by the upstream Mintlify migration, so obsolete build-only dependencies
cannot keep vulnerable transitive packages in the fork.
  (current-solo-toolchain)
- Adopt the audited RPGJS v5 `2fab01fb` beta.29 baseline, including the current
item, skill, hotbar, combat, GUI, audio, spritesheet, and Studio behavior and
tests in the inherited compatibility source. Preserve the transport-free Solo
package boundary and keep server, room, synchronization, and multiplayer code
out of Solo production bundles.
  (solo-beta29-baseline)
- Publish canonical GitHub source metadata and add a fail-closed coordinated
release transaction with exact-toolchain enforcement, descriptor-captured
security inputs, single-link byte-journaled recovery that preserves unproven
state, an externally pinned orchestrator trust root and signed
producer-disjoint reviewer assignment, clean export-complete archives, a
descriptor-captured in-memory `libnpmpublish` handoff with the complete packed
manifest bound into schema-3 signed provenance, monotonic candidate promotion,
and resumable byte-verified GitHub/Gitea prerelease evidence.
  (solo-beta29-release-transaction)
