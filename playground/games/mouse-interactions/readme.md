# Mouse Interactions

This playground demonstrates the client interaction API:

- hover popovers with `DOMContainer`
- client-only selection
- hitbox/custom-area hit testing
- drag/drop previews that call the server only on drop
- map clicks that call `player.moveTo({ x, y })` on the server

Try the gestures:

- click empty ground to move the player
- hover and click the guard
- click the chest to toggle local selection feedback
- drag the crate from its hitbox and drop it on another tile
- hover the highlighted tree trunk, not the leaves

Run it directly:

```bash
pnpm --dir playground/games/mouse-interactions dev
```
