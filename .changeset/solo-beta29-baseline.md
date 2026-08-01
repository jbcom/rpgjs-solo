---
"@jbcom/rpgjs-solo": patch
"@jbcom/rpgjs-solo-action-battle": patch
"@jbcom/rpgjs-solo-renderer": patch
"@jbcom/rpgjs-solo-vite": patch
---

Adopt the audited RPGJS v5 `2fab01fb` beta.29 baseline, including the current
item, skill, hotbar, combat, GUI, audio, spritesheet, and Studio behavior and
tests in the inherited compatibility source. Preserve the transport-free Solo
package boundary and keep server, room, synchronization, and multiplayer code
out of Solo production bundles.
