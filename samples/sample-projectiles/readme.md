# Projectile sample

Minimal sample showing a server-side projectile emitted from player input and rendered with a CanvasEngine component on the client.

```bash
pnpm --filter sample-projectiles dev
```

Move the player, then click the map to shoot a `bolt` toward the pointer. The
client calls `processAction("projectile:shoot", { target: { x, y } })`, and the
server handles the action payload in `onInput()` before calling
`player.projectiles.emit()`.

The action key still shoots in the direction the player is facing.
