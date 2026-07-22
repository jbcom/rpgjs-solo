---
"@rpgjs/action-battle": patch
"@rpgjs/client": patch
"@rpgjs/common": patch
"@rpgjs/server": patch
"@rpgjs/studio": patch
"@rpgjs/tiledmap": patch
"@rpgjs/testing": patch
"@rpgjs/vite": patch
"@rpgjs/vue": patch
---

Establish `defineModule()` as the canonical runtime module authoring API, export it from the client and server packages, keep `createModule()` for advanced provider composition, and align runtime-specific module installation documentation and examples.
