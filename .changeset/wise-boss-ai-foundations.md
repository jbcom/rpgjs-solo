---
"@rpgjs/action-battle": patch
"@rpgjs/client": patch
"@rpgjs/common": patch
"@rpgjs/server": patch
"@rpgjs/studio": patch
---

Add composable boss phase helpers, delayed AI sequences, server action intents,
movement and teleport conveniences, and a generic server-driven AI visual
registry. Resolve animation callbacks into serializable visual packets so
Studio combat media are honored without cloning functions across rooms.

Add the Adventure combat preset with buffered player combos, authoritative
charged attacks, dodge invulnerability, attack multipliers, stronger Impact
visuals, enemy telegraphs, reuse of the existing RPGJS HUD and graphic-bound
HP components, contextual animated damage typography, skill-specific FX,
and optional mobile heavy-attack controls. `preset: "classic"` preserves the
previous combat and UI defaults.

Resolve Action Battle reward notifications on the client through stable i18n
keys and JSON-safe interpolation parameters. Plural categories use the active
client locale, and authored item-name keys resolve on that same client. Existing
rewards without an item-name key retain their resolved database display name.
`showNotification()` now accepts a deferred translation descriptor while
preserving literal notification strings and permissive local translation params.

Position transient component animations from numeric world coordinates and
derive component bounds from visible pixels for generated Studio spritesheets,
so telegraphs, damage popups, and HP bars stay anchored to scaled characters
without including transparent frame padding.
