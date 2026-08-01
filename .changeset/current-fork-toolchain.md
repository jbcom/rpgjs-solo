---
"@rpgjs/action-battle": patch
"@rpgjs/chat": patch
"@rpgjs/client": patch
"@rpgjs/common": patch
"@rpgjs/physic": patch
"@rpgjs/server": patch
"@rpgjs/studio": patch
"@rpgjs/testing": patch
"@rpgjs/tiledmap": patch
"@rpgjs/ui-css": patch
"@rpgjs/vite": patch
"@rpgjs/vue": patch
---

Align every fork package on the current Vite 8 toolchain, update the exact
Signe runtime family together, and remove the unused Hono dev-server dependency
so published `@rpgjs/vite` consumers do not inherit its vulnerable Node adapter.
