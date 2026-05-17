# Projectile sample

Minimal sample showing a server-side projectile emitted from the action key and rendered with a CanvasEngine component on the client.

```bash
pnpm --filter sample-projectiles dev
```

Move the player, face the target, then press the action key. The server emits a `bolt` projectile with `player.projectiles.emit()`, and the client renders it with `projectile.ce`.
