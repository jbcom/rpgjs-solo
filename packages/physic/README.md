# RPG Physic

Deterministic 2D top-down physics for RPG-JS games.

Use it when you need the same gameplay simulation on the server and in the
browser: movement, collisions, sensors, and high-volume projectiles.

## Why Use It

`@rpgjs/physic` is designed for server-authoritative RPG gameplay where the
same rules must run consistently on the server and, when needed, on the client.

Key strengths:

- **Gameplay-first API:** create players, NPCs, obstacles, sensors, and
  projectiles without wiring a general-purpose physics engine from scratch.
- **Deterministic fixed-step simulation:** use `stepFrame()` with stable inputs
  for predictable server ticks and client prediction.
- **Server and browser friendly:** the runtime package is ESM, has no runtime
  dependencies, and does not require Node.js APIs.
- **Efficient broad phase by default:** `SpatialHash` is the recommended
  production default for RPG maps.
- **Lightweight projectiles:** projectiles are plain data with raycast-based hit
  detection, so you do not need to create a physics entity for every arrow,
  bullet, or spell.
- **RPG-oriented helpers:** sensors, collision masks, teleports, snapshots, and
  movement helpers are included for common RPG server workflows.

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

## Coordinate Model

Positions are expressed in world units.

- Entity `x` and `y` values represent the entity center.
- `speed` values are world units per second.
- `timeStep` is expressed in seconds. `1 / 60` means 60 simulation ticks per
  second.
- Rectangular hitboxes and static obstacles use `width` and `height` around the
  entity center.

For example, an obstacle at `{ x: 256, y: 128, width: 128, height: 24 }` is
centered at `(256, 128)`.

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

## Server Architecture

For online games, keep the server authoritative:

1. Receive player inputs.
2. Store the latest input per player for the next tick.
3. Call `engine.stepFrame(inputs)` at a fixed interval.
4. Broadcast only the state your clients need.
5. Let clients predict visuals locally when possible.

Prefer sending compact state:

```ts
function serializeState(engine: PhysicsEngine) {
  return {
    tick: engine.getTick(),
    entities: engine.getEntities().map((entity) => ({
      id: entity.uuid,
      x: entity.position.x,
      y: entity.position.y,
      vx: entity.velocity.x,
      vy: entity.velocity.y,
    })),
  };
}
```

Avoid sending every internal physics detail every tick. Treat the server as the
source of truth and the client as a renderer/predictor.

## Edge And Durable Objects

The package runtime is suitable for edge environments because it does not depend
on Node.js APIs. A natural Cloudflare Durable Object model is:

```txt
1 Durable Object = 1 active map instance, room, battle, or dungeon
```

Good Durable Object usage:

- Create one `PhysicsEngine` per active map instance.
- Load static map blockers when the object starts.
- Apply inputs through RPC or WebSocket messages.
- Run ticks only while the instance is active.
- Persist the canonical game state you need to recover after eviction.
- Rebuild the engine from persisted state when the object wakes up.

Avoid:

- One global Durable Object for the whole game world.
- A permanent 60 Hz tick for empty maps.
- Relying only on in-memory engine state for important gameplay data.
- Using `RegionManager` as Durable Object sharding. It is an in-memory
  experimental API, not distributed edge partitioning.

For large games, shard by map instance first. Sharding one continuous map across
multiple Durable Objects is possible, but it requires explicit boundary
management, migration rules, and cross-object interaction handling.

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

Snapshots are intentionally lightweight. `takeSnapshot()` stores physics state
for existing entities: position, velocity, rotation, angular velocity, sleeping
state, and tick. It does not serialize the full map, static obstacle definitions,
hitbox setup, projectiles, sensors, callbacks, movement strategies, or custom
game data. For persistence or Durable Object recovery, store your canonical game
state separately and use snapshots only as one part of the reconstruction flow.

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

## Movement Strategies

Use `MovementManager` when a movement is not just direct player input. It is
useful for dashes, knockbacks, scripted movement, path following, ice movement,
or other temporary behaviours.

Available presets:

- `Dash`: applies a burst of velocity in one direction for a fixed duration.
- `Knockback`: pushes a body in one direction with optional decay.
- `LinearMove`: moves a body in a constant direction.
- `LinearRepulsion`: pushes a body away from a point or source.
- `PathFollow`: moves a body along a list of waypoints.
- `SeekAvoid`: seeks a target while avoiding nearby obstacles.
- `ProjectileMovement`: moves a body like a projectile.
- `IceMovement`: simulates sliding movement, including optional entry
  velocity for slippery terrain.
- `Oscillate`: moves a body back and forth.
- `CompositeMovement`: combines multiple movement strategies.

```ts
const movement = engine.getMovementManager();

const dash = movement.dash(player, {
  speed: 240,
  direction: { x: 1, y: 0 },
  duration: 0.15,
  onComplete: () => {
    engine.moveEntity(player, 'idle');
  },
});

function tick() {
  engine.stepWithMovements();
}

dash.finished.then(() => {
  console.log('dash complete');
});
```

Call `stepWithMovements()` or call `updateMovements()` before `step()` so active
strategies update entity velocities before the physics tick.

Helper methods return a `MovementHandle`:

```ts
const patrol = movement.followPath(guard, {
  waypoints: [
    { x: 120, y: 120 },
    { x: 360, y: 120 },
    { x: 360, y: 300 },
  ],
  speed: 80,
  loop: true,
});

if (patrol.isActive()) {
  patrol.cancel();
}
```

Common helper options:

- `replace`: remove existing movements on the target before adding the new one
  (defaults to `true` for helper methods).
- `stopOnComplete`: set velocity to zero when the movement finishes.
- `onStart`: callback called on the first movement update.
- `onComplete`: callback called when the strategy finishes naturally.

Use `replace: false` when you intentionally want to stack strategies:

```ts
movement.dash(player, {
  speed: 260,
  direction: { x: 1, y: 0 },
  duration: 0.12,
  replace: false,
});
```

For slippery terrain, start `ice()` when an entity enters the surface and pass
the current velocity so the slide continues from the previous movement:

```ts
import type { IceMovement } from '@rpgjs/physic';

const ice = movement.ice(player, {
  direction: player.velocity.lengthSquared() > 0
    ? player.velocity.normalize()
    : { x: 1, y: 0 },
  maxSpeed: 180,
  acceleration: 0.35,
  friction: 0.08,
  initialVelocity: player.velocity,
  replace: false,
});
const iceMovement = ice.strategy as IceMovement;

// While the player stays on ice:
iceMovement.setTargetDirection({ x: 1, y: 0 });

// When the input is released, the entity keeps sliding and slows down.
iceMovement.stop();
```

### Custom Movement Strategies

Create a custom movement by implementing `MovementStrategy`.

```ts
import type { MovementBody, MovementStrategy } from '@rpgjs/physic';

class PatrolMovement implements MovementStrategy {
  private elapsed = 0;

  constructor(
    private readonly speed: number,
    private readonly duration: number,
  ) {}

  update(body: MovementBody, dt: number): void {
    this.elapsed += dt;
    body.setVelocity({ x: this.speed, y: 0 });
  }

  isFinished(): boolean {
    return this.elapsed >= this.duration;
  }

  onFinished(): void {
    // Optional hook for cleanup or chaining.
  }
}

const patrolDone = engine.getMovementManager().add(
  player,
  new PatrolMovement(80, 2),
);
```

`update(body, dt)` is called before each physics step. Use it to change the
body velocity, or `translate()` when you intentionally need direct movement.
`dt` is in seconds and should match the engine tick duration. When
`isFinished()` returns `true`, the manager removes the strategy, calls
`onFinished()`, triggers the `onComplete` option, and resolves the `Promise`
returned by `movement.add()`.

Do not `await movement.add()` before your tick loop starts. The promise resolves
only after future calls to `stepWithMovements()` or `updateMovements()`.

The low-level `movement.add(entity, new MyStrategy())` API is still available
when you need to instantiate strategies directly. Prefer helper methods for
common presets and `add()` for custom or advanced composition.

## Performance Guidelines

Performance depends more on world shape and simulation policy than on raw entity
count. Benchmark with your real map, not only synthetic tests.

Recommended defaults:

- Start with one `PhysicsEngine` per active map instance.
- Use the default `SpatialHash` broad phase.
- Prefer 20 or 30 Hz server ticks for networked games unless 60 Hz is required.
- Keep static blockers as static obstacles (`mass: 0`).
- Use `ProjectileSystem` for arrows, bullets, and spells instead of full
  physics entities.
- Send projectile `spawn`, `hit`, and `destroy` events instead of syncing every
  projectile position every tick.
- Keep sensor counts reasonable. Cone sensors with `limitedByWalls` can raycast
  and are more expensive than simple circular sensors.
- Use `positionQuantizationStep` and `velocityQuantizationStep` when you need to
  reduce floating-point drift across server/client prediction.

Watch for bottlenecks:

- Too many dynamic entities colliding in the same area.
- Too many sensors updated every tick.
- Too many projectiles with long raycasts.
- Broadcasting full world state to every client.
- Running ticks for inactive or empty map instances.

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
npm run example:movement
```

The RPG example is a plain HTML/Canvas mini-game using the recommended APIs:
characters, static obstacles, sensors, and `ProjectileSystem`.

The movement example is a focused arena showing `MovementManager` helpers such
as `dash`, `knockback`, `followPath`, `oscillate`, `seekAvoid`, and `ice`.

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
