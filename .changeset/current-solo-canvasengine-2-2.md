---
"@jbcom/rpgjs-solo": patch
"@jbcom/rpgjs-solo-action-battle": patch
"@jbcom/rpgjs-solo-renderer": patch
"@jbcom/rpgjs-solo-vite": patch
---

Align the complete Solo cohort with Node 24.19.0, pnpm 11.21.0, Vite 8.2.1, and
CanvasEngine/compiler/presets/Tiled 2.2.0. Publish an exact renderer
compatibility record for consumer-injected
`@arcade-cabinet/rpgjs-patches@0.3.0`, keep the installer ahead of scene
bootstrap, and prevent CanvasEngine compiler-private metadata from leaking
through the RPGJS Vite plugin declaration boundary.
