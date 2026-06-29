---
title: "Studio event page options"
description: "Configure Studio event page hitbox and rendering layer options."
---

# Studio event page options

Studio event pages can include `hitbox` and `options` fields. The runtime applies them when the page becomes the active trigger.

## Event Hitbox

- `hitbox.width`: collision hitbox width in RPGJS pixels.
- `hitbox.height`: collision hitbox height in RPGJS pixels.

When omitted, the runtime keeps the default `32 x 32` event hitbox. Graphic/media scale affects only the displayed sprite size and must not scale the hitbox dimensions.

Studio previews the effective hitbox at the foot of the selected sprite.

## Rendering Layer

- `alwaysOnTop`: render the event above nearby characters.
- `alwaysOnBottom`: render the event below nearby characters.

Use only one rendering layer option at a time. If both are present in a runtime payload, `alwaysOnTop` takes precedence.
