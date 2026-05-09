# Movement Arena Example

This example is a focused browser game for `MovementManager`.

It demonstrates:

- `movement.dash()` for the player burst movement
- `movement.knockback()` for radial repulsion
- `movement.followPath()` for a patrolling guard
- `movement.oscillate()` for a moving orb
- `movement.seekAvoid()` for a chaser that follows the hero
- `movement.ice()` for a slippery floor that affects the hero
- `MovementHandle.cancel()`, `isActive()`, and `finished`

The ice floor is a gameplay surface, not a physical obstacle. When the hero
enters it, the demo starts an `IceMovement` with the hero's current velocity;
while the hero stays on the surface, input changes the target direction slowly.
Releasing input makes the hero keep sliding and decelerate with friction. The
acceleration and friction values are derived from the hero mass.

## Controls

- `WASD` or arrow keys: move
- `Shift`: dash in the current direction
- `Space`: knock back nearby NPCs
- `1`: reset the guard path

## Run

```bash
npm run example:movement
```

The Vite dev server serves this folder directly.
