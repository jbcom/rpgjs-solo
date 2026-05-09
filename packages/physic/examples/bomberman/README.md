# Bomberman Example

This tutorial explains how this grid-based Bomberman-style example uses
`@rpgjs/physic`, and why the library is useful even when the game rules are
mostly tile-based.

Bomberman is a good fit for this kind of split: bombs, flames, and block
destruction are discrete grid rules, while players, enemies, blockers, and
movement benefit from a continuous physics simulation.

## 1. Create the Physics World

The example starts with one `PhysicsEngine` instance:

```ts
const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  gravity: new Vector2(0, 0),
  enableSleep: false,
  spatialCellSize: TILE,
  spatialGridWidth: COLS,
  spatialGridHeight: ROWS,
});
```

This gives the game a deterministic top-down simulation. The grid still decides
where tiles are, but the engine handles collision response, entity velocity, and
fixed simulation ticks.

## 2. Keep Bomberman Rules in the Grid

The grid remains the source of truth for Bomberman-specific rules:

- tile placement for walls, destructible blocks, bombs, and flames
- bomb countdowns
- cross-shaped explosion propagation
- stopping flames on indestructible walls
- destroying the first destructible block hit by each flame branch
- deciding whether the player or enemy is standing on a flame tile

This matters because these rules are not really physics rules. They are gameplay
rules. `@rpgjs/physic` is used where physics is useful, not forced into places
where a grid is simpler and clearer.

## 3. Turn Tiles into Static Obstacles

Indestructible walls and destructible blocks are registered in the physics world
with `createStaticObstacle()`:

```ts
engine.createStaticObstacle(tileId('wall', col, row), {
  x: tileCenter(col),
  y: tileCenter(row),
  width: TILE,
  height: TILE,
});
```

This is useful because the player and enemy do not need custom collision code
for each tile. Once a wall or block exists as a static obstacle, the physics
engine prevents characters from walking through it.

Destructible blocks also stay in a map:

```ts
destructibleBlocks.set(tileKey(col, row), entity);
```

The grid can then decide which block is hit by an explosion, while the engine
can remove the matching physical obstacle.

## 4. Create Moving Characters

The player and enemy are both created with `createCharacter()`:

```ts
const player = engine.createCharacter('player', {
  x: tileCenter(1),
  y: tileCenter(1),
  hitbox: { width: 24, height: 24 },
  speed: PLAYER_SPEED,
  linearDamping: 0.08,
});
```

This gives each actor a stable id, a hitbox, a movement speed, and a dynamic
body in the world. Input can then be applied with `moveEntity()`:

```ts
engine.moveEntity(player, resolveInputDirection());
```

The important part is that movement is continuous. The player can slide around
corners and collide naturally with obstacles, while the game can still convert
the current world position back to a tile when it needs Bomberman logic.

## 5. Run a Fixed Simulation Step

Every frame accumulates time, then advances the simulation in fixed `1 / 60`
steps:

```ts
engine.stepFrame();
```

This is useful for games because movement and collision behavior do not depend
on the rendering frame rate. The same pattern can be reused in a server tick,
client prediction loop, or deterministic gameplay test.

## 6. Use Bombs as Temporary Blockers

Bombs start as gameplay data:

```ts
bombs.set(key, {
  id: `bomb-${bombSequence}`,
  owner,
  col,
  row,
  timer: BOMB_TIMER,
  entity: null,
});
```

After the owner leaves the bomb tile, the bomb becomes a static obstacle:

```ts
bomb.entity = engine.createStaticObstacle(bomb.id, {
  x: tileCenter(bomb.col),
  y: tileCenter(bomb.row),
  width: TILE - 10,
  height: TILE - 10,
});
```

This demonstrates a practical pattern: an object can begin as pure gameplay
state, then become part of the physics world only when it needs to block
movement.

## 7. Remove Destroyed Objects from Physics

When an explosion destroys a block, the grid is updated and the physical entity
is removed:

```ts
engine.removeEntity(block);
destructibleBlocks.delete(key);
setTile(col, row, 'floor');
```

The benefit is immediate: once the block is removed from the engine, characters
can walk through that tile without any extra collision bookkeeping.

The same pattern is used for expired bombs and defeated enemies.

## Enemy AI

The enemy is also a physics character. Its decisions are grid-based, but its
movement still goes through the physics engine.

The AI:

- checks active bomb blast lanes and flame tiles
- refuses to place a bomb if it cannot find a route to a safe tile
- places bombs to threaten the player or break destructible blocks
- follows its planned escape route after placing a bomb
- uses the same obstacle and explosion logic as player bombs

This shows why the split is useful: path decisions are easier on the grid, while
actual movement and collision remain handled by `@rpgjs/physic`.

## Why This Is Useful

Without `@rpgjs/physic`, this example would need custom code for:

- character velocity and movement normalization
- collision response against walls, blocks, and bombs
- keeping moving entities out of static blockers
- synchronizing obstacle removal with movement
- running the gameplay loop on a fixed step

With the library, the example can focus on Bomberman rules while reusing a
deterministic 2D physics layer for the common movement and collision problems.

## Controls

- `WASD` or arrow keys: move
- `Space`: place a bomb
- `R`: reset after defeat

## Run

```bash
npm run example:bomberman
```

The Vite dev server serves this folder directly.
