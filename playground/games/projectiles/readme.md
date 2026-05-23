# Projectiles

Minimal demo showing a server-side projectile emitted from player input and
rendered with a CanvasEngine component on the client.

## Run

From the repository root:

```bash
pnpm playground
```

Then select **Projectiles** in the launcher at `http://localhost:5174`.

Run only this game:

```bash
pnpm --dir playground dev:projectiles
```

Direct URL: `http://localhost:5181`.

Move the player, then click the map to shoot a `bolt` toward the pointer. The
client calls `processAction("projectile:shoot", { target: { x, y } })`, and the
server handles the action payload in `onInput()` before calling
`player.projectiles.emit()`.

The action key still shoots in the direction the player is facing.

Projectiles collide with both the `target` event and static physics hitboxes
loaded from the map data. Static hitbox impacts destroy the projectile without
applying damage because they do not resolve to a gameplay target.
