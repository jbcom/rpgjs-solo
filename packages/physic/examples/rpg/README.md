# Mini RPG Canvas Example

This example is a small browser RPG built with plain HTML and Canvas.

It uses the physics package directly:

- `PhysicsEngine.createCharacter()` for the hero and enemies
- `PhysicsEngine.createStaticObstacle()` for walls and map blockers
- `PhysicsEngine.createSensor()` / `ZoneManager` for the hero vision counter
- `PhysicsEngine.stepFrame()` for fixed-tick movement
- `ProjectileSystem` for server-style projectiles without creating physics entities

## Controls

- `WASD` or arrow keys: move
- `Space`: shoot toward the cursor
- Mouse click: shoot once

## Run

```bash
npm run example:rpg
```

The Vite dev server serves this folder directly.
