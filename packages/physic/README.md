# RPG Physic

Deterministic 2D top-down physics for RPG-JS games.

Use it when you need the same gameplay simulation on the server and in the
browser: movement, collisions, sensors, and high-volume projectiles.

## What To Use

For most RPG-JS projects, start with this stack:

- `PhysicsEngine` as the main entry point.
- `createCharacter()` for players and NPCs.
- `createStaticObstacle()` for walls, trees, rocks, and map blockers.
- `createSensor()` for vision, skills, aggro ranges, and area detection.
- `stepFrame()` for a fixed server tick.
- `ProjectileSystem` for arrows, bullets, spells, and other high-volume projectiles.

Keep these for advanced or experimental work:

- `World`, `Entity`, and colliders when you need low-level control.
- `MovementManager` and movement strategies for scripted movement.
- `RegionManager`, `Region`, `BVH`, and `Quadtree` for experiments and benchmarks.

The recommended production default is a single `PhysicsEngine` world with the
default `SpatialHash` broad phase.

## Install

```bash
npm install @rpgjs/physic
```

## Quick Start

```ts
import { PhysicsEngine, Vector2 } from '@rpgjs/physic';

const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  gravity: new Vector2(0, 0),
});

const hero = engine.createCharacter('hero', {
  x: 100,
  y: 100,
  hitbox: { width: 16, height: 24 },
  speed: 120,
});

engine.createStaticObstacle('tree', {
  x: 180,
  y: 100,
  width: 32,
  height: 32,
});

engine.stepFrame({
  hero: 'right',
});

console.log(hero.position.x, hero.position.y);
```

## Server Tick Loop

Run physics from a fixed tick on the server. Send inputs to the server, apply
them with `stepFrame()`, then broadcast only the state your game needs.

```ts
const engine = new PhysicsEngine({ timeStep: 1 / 60 });

engine.createCharacter('player-1', {
  x: 100,
  y: 100,
  hitbox: 12,
  speed: 140,
});

function tick(inputs: Record<string, 'up' | 'down' | 'left' | 'right' | 'idle'>) {
  const tickId = engine.stepFrame(inputs);

  return {
    tick: tickId,
    players: engine.getEntities().map((entity) => ({
      id: entity.uuid,
      x: entity.position.x,
      y: entity.position.y,
    })),
  };
}
```

`stepFrame()` applies movement inputs, advances physics by one tick, updates
sensors, and returns the new tick number.

## Characters

Use `createCharacter()` for players, NPCs, monsters, and moving objects.

```ts
const player = engine.createCharacter('player-1', {
  x: 64,
  y: 128,
  hitbox: { width: 18, height: 28 },
  speed: 160,
  linearDamping: 0.12,
});
```

Supported hitboxes:

```ts
hitbox: 12
hitbox: { radius: 12 }
hitbox: { width: 16, height: 24 }
hitbox: { type: 'circle', radius: 12 }
hitbox: { type: 'box', width: 16, height: 24 }
hitbox: { type: 'capsule', radius: 8, height: 28 }
```

Move a character manually:

```ts
engine.moveEntity('player-1', 'left');
engine.moveEntity(player, { x: 1, y: 1 }, 220);
engine.moveEntity('player-1', 'idle');
```

Teleport safely:

```ts
engine.teleportEntity('player-1', { x: 320, y: 96 });
```

Teleporting through the engine keeps the broad phase synchronized.

## Static Obstacles

Use `createStaticObstacle()` for map blockers.

```ts
engine.createStaticObstacle('wall-1', {
  x: 256,
  y: 128,
  width: 128,
  height: 24,
});
```

Static obstacles block dynamic entities and can be used by raycasts and sensors.

## Sensors

Sensors detect entities without creating physical collision responses. They are
useful for vision, aggro, skill ranges, interaction zones, explosions, and traps.

```ts
engine.createSensor('hero-vision', {
  entity: hero,
  radius: 120,
  onEnter: (entities) => {
    console.log('entered vision:', entities.map((entity) => entity.uuid));
  },
  onExit: (entities) => {
    console.log('left vision:', entities.map((entity) => entity.uuid));
  },
});

engine.stepFrame({ hero: 'right' });
```

Static sensor:

```ts
engine.createSensor('healing-zone', {
  position: { x: 500, y: 300 },
  radius: 48,
  onEnter: healEntities,
});
```

Cone sensor:

```ts
engine.createSensor('guard-view', {
  entity: guard,
  radius: 160,
  angle: 90,
  direction: 'down',
  limitedByWalls: true,
});
```

For advanced zone operations, use `engine.getZoneManager()`.

## Projectiles

Use `ProjectileSystem` for high-volume projectiles. Projectiles are plain data,
not full physics entities, so you can simulate many of them without adding
projectile-projectile collisions or syncing positions every tick.

```ts
import { ProjectileSystem } from '@rpgjs/physic';

const projectiles = new ProjectileSystem(engine);

projectiles.onSpawn(({ projectile }) => {
  socket.broadcast('projectile:spawn', {
    id: projectile.id,
    ownerId: projectile.ownerId,
    origin: projectile.origin,
    direction: projectile.direction,
    speed: projectile.speed,
    range: projectile.range,
    ttl: projectile.ttl,
    spawnTick: projectile.spawnTick,
  });
});

projectiles.onHit(({ projectile, hit }) => {
  socket.broadcast('projectile:hit', {
    id: projectile.id,
    targetId: hit.entity.uuid,
    x: hit.point.x,
    y: hit.point.y,
  });
});

projectiles.onDestroy(({ projectile, reason }) => {
  socket.broadcast('projectile:destroy', {
    id: projectile.id,
    reason,
  });
});

projectiles.spawn({
  id: 'arrow-1',
  ownerId: 'hero',
  origin: hero.position,
  direction: { x: 1, y: 0 },
  speed: 420,
  range: 640,
  ttl: 1.5,
  spawnTick: engine.getTick(),
});

projectiles.step(1 / 60);
```

For sockets, send:

- `spawn`
- `hit`
- `destroy`

Avoid sending every projectile position every tick. Clients can predict visuals
from spawn data while the server remains authoritative for hits.

## Collisions

Listen to global collision events:

```ts
engine.getEvents().onCollisionEnter((collision) => {
  console.log(collision.entityA.uuid, collision.entityB.uuid);
});
```

Listen on a single entity:

```ts
hero.onCollisionEnter(({ other }) => {
  console.log('hero touched', other.uuid);
});
```

Use collision masks for filtering:

```ts
const PLAYER = 0x01;
const WALL = 0x02;

engine.createCharacter('hero', {
  x: 0,
  y: 0,
  hitbox: 12,
  speed: 120,
  collisionCategory: PLAYER,
  collisionMask: WALL,
});
```

## Manual Mutations

Prefer engine helpers. They keep spatial data synchronized:

```ts
engine.moveEntity('hero', 'right');
engine.teleportEntity('hero', { x: 100, y: 100 });
engine.freeze(entity);
engine.unfreeze(entity);
```

If you mutate an entity directly, call `updateEntity()` afterward:

```ts
entity.position.set(128, 96);
entity.width = 32;
entity.height = 48;
engine.updateEntity(entity);
```

## Prediction And Reconciliation

For client prediction, use fixed ticks and snapshots.

```ts
const snapshot = engine.takeSnapshot();

engine.restoreSnapshot(serverSnapshot);
for (const input of pendingInputs) {
  engine.stepFrame({ hero: input.direction });
}
```

Quantization can reduce floating-point drift:

```ts
const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  positionQuantizationStep: 1 / 16,
  velocityQuantizationStep: 1 / 256,
});
```

`PredictionController` and `DeterministicInputBuffer` are available when you
need a fuller prediction/reconciliation pipeline.

## Low-Level API

Use low-level APIs when the RPG helpers are not enough:

- `createEntity()` for custom bodies.
- `World` for direct simulation control.
- `raycast()` for line checks and targeting.
- `sweep()` for continuous collision checks.
- `MovementManager` for scripted movement strategies such as dash, knockback,
  path following, or projectile-style movement.

Example:

```ts
const entity = engine.createEntity({
  uuid: 'custom-body',
  position: { x: 0, y: 0 },
  radius: 10,
  mass: 1,
});

const hit = engine.raycast(entity.position, { x: 1, y: 0 }, 200);
```

## Experimental APIs

These APIs are exported, but are not the recommended default path yet:

- `RegionManager`
- `Region`
- `BVH`
- `Quadtree`

Use them for experiments and benchmarks. Keep `PhysicsEngine` without regions
and the default `SpatialHash` unless your own benchmark shows a clear win.

## Examples

```bash
npm run example:rpg
```

The RPG example is a plain HTML/Canvas mini-game using the recommended APIs:
characters, static obstacles, sensors, and `ProjectileSystem`.

Other examples in this package are intended for development and regression
testing.

## Commands

```bash
npm test
npm run typecheck
npm run build
npm run docs
npm run test:coverage
npm run benchmark:projectiles
```

Benchmark commands:

```bash
npm run benchmark
npm run benchmark:1000
npm run benchmark:10000
npm run benchmark:collisions
npm run benchmark:projectiles
npm run benchmark:regions
```

## Current Benchmark Signal

On the current development machine, the lightweight projectile benchmark showed:

- 1k active projectiles: about `1.09ms/step`
- 5k active projectiles: about `5.68ms/step`
- 10k active projectiles: about `11.92ms/step`
- 0 physics entities created for projectiles

Treat these as micro-benchmarks. For production sizing, benchmark your real map,
obstacle density, player count, masks, and socket interest management.

## Package Shape

Main exports:

```ts
import {
  PhysicsEngine,
  ProjectileSystem,
  Vector2,
  AABB,
  Entity,
  World,
} from '@rpgjs/physic';
```

The package has no runtime dependencies.
