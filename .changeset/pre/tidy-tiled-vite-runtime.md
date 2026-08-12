---
"@rpgjs/vite": patch
---

Prevent Vite dev dependency optimization from prebundling RPGJS and CanvasEngine runtime packages that share PixiJS state, fixing missing TileMap render pipe registration in the starter.
