# RPG Physic

A deterministic 2D top-down physics library for RPG, sandbox and MMO games.

## Features

- **Deterministic**: Same inputs produce same results across platforms
- **Cross-platform**: Works in Node.js, browsers, Deno, and Web Workers
- **Modular**: Extensible architecture with plugin support
- **Performant**: Optimized for 1000+ dynamic entities at 60 FPS
- **Zero dependencies**: No external runtime dependencies
- **Region-based**: Support for distributed simulation across regions
- **Collision detection**: Circle and AABB colliders with spatial optimization
- **Forces & Constraints**: Springs, anchors, attractions, explosions
- **Event system**: Collision events, sleep/wake notifications

## Installation

```bash
npm install @rpgjs/physic
```

## Quick Start

```typescript
import { PhysicsEngine } from '@rpgjs/physic';

// Create physics engine
const engine = new PhysicsEngine({
  timeStep: 1 / 60, // 60 FPS
});

// Create entities
const ball = engine.createEntity({
  position: { x: 0, y: 0 },
  radius: 10,
  mass: 1,
  velocity: { x: 5, y: 0 },
});

const ground = engine.createEntity({
  position: { x: 0, y: 100 },
  width: 200,
  height: 10,
  mass: 0, // Static
});

// Listen to collisions
engine.getEvents().onCollisionEnter((collision) => {
  console.log('Collision!', collision.entityA.uuid, collision.entityB.uuid);
});

// Simulation loop
function gameLoop() {
  engine.step();
  // Render entities at engine.getEntities()
  requestAnimationFrame(gameLoop);
}

gameLoop();
```

## Determinism & Networking

`@rpgjs/physic` is deterministic as long as every peer advances the simulation by **whole ticks**.  
Use the new `stepOneTick` / `stepTicks` helpers to drive the engine with an integer tick counter, and keep a copy of that counter for reconciliation purposes.

```ts
const engine = new PhysicsEngine({ timeStep: 1 / 60 });
const fixedDt = engine.getWorld().getTimeStep();

function predictionLoop(collectedInputs: InputBuffer) {
  // Apply buffered inputs for this tick (movement, abilities, etc.)
  applyInputs(collectedInputs.peek());

  engine.updateMovements(fixedDt);
  const tick = engine.stepOneTick(); // identical tick index on every machine
  renderAtTick(tick);
}
```

### Snapshots & Reconciliation

For client-side prediction, take a snapshot when the server acknowledges a tick, rewind to it, then replay the unconfirmed inputs:

```ts
const confirmed = engine.takeSnapshot();
pendingInputs = []; // clear inputs up to confirmed tick

// ...later (server correction)
engine.restoreSnapshot(serverSnapshot);
for (const input of pendingInputs) {
  applyInput(input);
  engine.stepOneTick();
}
```

Snapshots only store the minimal per-entity state (position, velocity, rotation, sleeping flag) to keep payloads small.

### Quantization

To eliminate floating-point drift across platforms, you can quantize positions/velocities every tick:

```ts
const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  positionQuantizationStep: 1 / 16,   // 1/16th of a pixel
  velocityQuantizationStep: 1 / 256,  // optional velocity clamp
});
```

Quantization is optional but strongly recommended for authoritative MMO servers.

### Prediction & Reconciliation Helpers

Networking a top-down RPG now relies on dedicated utilities:

- `PredictionController` (client-side) buffers local inputs, queues server snapshots, and reconciles the physics body once authoritative data arrives.
- `DeterministicInputBuffer` (server-side) stores per-player inputs in order, deduplicates frames, and lets you consume the queue deterministically each tick.

```ts
// Client
const engine = new PhysicsEngine({ timeStep: 1 / 60 });
const hero = engine.createEntity({ /* ... */ });

const prediction = new PredictionController({
  correctionThreshold: 5,
  getPhysicsTick: () => engine.getTick(),
  getCurrentState: () => ({ 
    x: hero.position.x, 
    y: hero.position.y, 
    direction: hero.velocity 
  }),
  setAuthoritativeState: (state) => {
    hero.position.set(state.x, state.y);
    hero.velocity.set(state.direction.x, state.direction.y);
  },
});

// Server
const buffer = new DeterministicInputBuffer<Direction>();
buffer.enqueue(playerId, { frame, tick, timestamp, payload: direction });
const orderedInputs = buffer.consume(playerId);
```

Activate prediction only when you need it; otherwise the controller can be skipped and everything falls back to the authoritative server position.

When gameplay enters a state where buffered movement must not be replayed, such
as a blocking attack or dialog, call `clearPendingInputs()` on the prediction
controller. It discards pending input history while keeping the next frame
number monotonic.

## Integration with @rpgjs/common

`@rpgjs/common` now delegates all simulation to this package. The legacy Matter.js wrapper has been removed in favour of the shared deterministic `PhysicsEngine` that lives directly in `@rpgjs/physic`. Every hitbox, zone and movement strategy is backed by the deterministic core exposed here, ensuring the same behaviour on both client and server without third-party physics engines.

## Using PhysicsEngine for RPG Games

For RPG-style games, use `PhysicsEngine` directly instead of the deprecated `TopDownPhysics` class. This section shows how to create characters, manage collisions, zones, and movements using the core engine.

### Creating Characters

Characters in RPG games are typically circular entities with a radius. Create them using `createEntity`:

```ts
import { PhysicsEngine, Vector2, EntityState } from '@rpgjs/physic';

const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  gravity: new Vector2(0, 0), // No gravity for top-down games
  enableSleep: false,
});

// Create a hero character
const hero = engine.createEntity({
  uuid: 'hero-1',
  position: { x: 128, y: 96 },
  radius: 24,
  mass: 1,
  friction: 0.4,
  linearDamping: 0.2,
  maxLinearVelocity: 200, // pixels per second
});

// Create an NPC
const npc = engine.createEntity({
  uuid: 'npc-1',
  position: { x: 200, y: 150 },
  radius: 20,
  mass: 100,
  friction: 0.4,
  linearDamping: 0.2,
  maxLinearVelocity: 150,
});
```

### Character Movement

Use the `MovementManager` to apply movement strategies to characters:

```ts
import { MovementManager, LinearMove, Dash } from '@rpgjs/physic';

const movement = engine.getMovementManager();

// Apply linear movement to hero (e.g., from keyboard input)
const moveSpeed = 200; // pixels per second
const direction = new Vector2(1, 0).normalize(); // normalized direction
movement.add(hero, new LinearMove(direction, moveSpeed));

// Apply a dash ability
movement.add(hero, new Dash(300, { x: 1, y: 0 }, 0.2)); // speed, direction, duration

// Update movements and step simulation
function gameLoop() {
  engine.stepWithMovements(); // Updates movements and advances physics
  // Render entities...
  requestAnimationFrame(gameLoop);
}
```

### Handling Input for Character Control

For player-controlled characters, set velocity directly based on input:

```ts
const moveSpeed = 200; // pixels per second

function updateHeroMovement(keys: { [key: string]: boolean }) {
  const move = new Vector2(0, 0);
  
  if (keys['w'] || keys['arrowup']) move.y -= 1;
  if (keys['s'] || keys['arrowdown']) move.y += 1;
  if (keys['a'] || keys['arrowleft']) move.x -= 1;
  if (keys['d'] || keys['arrowright']) move.x += 1;
  
  if (move.length() > 0) {
    move.normalizeInPlace().mulInPlace(moveSpeed);
    hero.setVelocity({ x: move.x, y: move.y });
  } else {
    hero.setVelocity({ x: 0, y: 0 });
  }
}

// In your game loop
function gameLoop() {
  updateHeroMovement(keyboardState);
  engine.step();
  // Render...
}
```

### Character Collisions

By default, all entities with `mass > 0` will collide with each other and with static obstacles. To control collision behavior:

```ts
// Make an entity static (won't be pushed, but will block others)
const wall = engine.createEntity({
  position: { x: 100, y: 0 },
  width: 20,
  height: 100,
  mass: Infinity, // or mass: 0
  state: EntityState.Static,
});
wall.freeze(); // Ensure it's frozen

// Listen to collisions
hero.onCollisionEnter(({ other }) => {
  console.log(`Hero collided with ${other.uuid}`);
});

// Temporarily disable collisions for a character (e.g., for phasing ability)
// Note: This requires managing collision groups or using custom collision filtering
// For now, you can teleport the entity or use movement strategies to pass through
```

### Zones for Vision and Detection

Use `ZoneManager` to create vision cones, skill ranges, and area-of-effect detection:

```ts
const zones = engine.getZoneManager();

// Create a vision zone attached to the hero
const visionZoneId = zones.createAttachedZone(hero, {
  radius: 150,
  angle: 120, // 120-degree cone
  direction: 'right', // Initial direction
  offset: { x: 0, y: 0 },
}, {
  onEnter: (entities) => {
    console.log('Hero sees entities:', entities.map(e => e.uuid));
  },
  onExit: (entities) => {
    console.log('Hero lost sight of entities:', entities.map(e => e.uuid));
  },
});

// Update zone direction based on hero movement
function updateVisionZone() {
  const velocity = hero.velocity;
  if (velocity.length() > 1) {
    // Determine direction from velocity
    const angle = Math.atan2(velocity.y, velocity.x);
    let direction: 'up' | 'down' | 'left' | 'right' = 'right';
    if (angle > -Math.PI / 4 && angle < Math.PI / 4) direction = 'right';
    else if (angle > Math.PI / 4 && angle < 3 * Math.PI / 4) direction = 'down';
    else if (angle > -3 * Math.PI / 4 && angle < -Math.PI / 4) direction = 'up';
    else direction = 'left';
    
    zones.updateZone(visionZoneId, { direction });
  }
}

// In game loop
function gameLoop() {
  engine.step();
  zones.update(); // Important: update zones after physics step
  updateVisionZone();
  // Render...
}
```

### Deterministic Tick-Based Simulation

For networked games, use `stepOneTick` to ensure deterministic simulation:

```ts
const engine = new PhysicsEngine({ timeStep: 1 / 60 });
const fixedDt = engine.getWorld().getTimeStep();

function gameLoop() {
  // Gather inputs for this tick
  const input = collectInputs();
  
  // Apply inputs
  applyInputToHero(hero, input);
  
  // Advance exactly one tick
  const tick = engine.stepOneTick();
  
  // Update zones
  zones.update();
  
  // Render at this tick
  render();
  
  requestAnimationFrame(gameLoop);
}
```

### Complete RPG Example

Here's a complete example combining all concepts:

```ts
import {
  PhysicsEngine,
  Vector2,
  MovementManager,
  ZoneManager,
  LinearMove,
  SeekAvoid,
} from '@rpgjs/physic';

const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  gravity: new Vector2(0, 0),
  enableSleep: false,
});

const movement = engine.getMovementManager();
const zones = engine.getZoneManager();

// Create hero
const hero = engine.createEntity({
  uuid: 'hero',
  position: { x: 300, y: 300 },
  radius: 25,
  mass: 1,
  friction: 0.4,
  linearDamping: 0.2,
  maxLinearVelocity: 200,
});

// Create NPCs
const npc = engine.createEntity({
  uuid: 'npc-1',
  position: { x: 500, y: 400 },
  radius: 20,
  mass: 100,
  friction: 0.4,
  linearDamping: 0.2,
  maxLinearVelocity: 150,
});

// Create static obstacles (walls)
const wall = engine.createEntity({
  uuid: 'wall-1',
  position: { x: 400, y: 300 },
  width: 20,
  height: 100,
  mass: Infinity,
});
wall.freeze();

// Create vision zone for hero
const visionZoneId = zones.createAttachedZone(hero, {
  radius: 150,
  angle: 120,
  direction: 'right',
}, {
  onEnter: (entities) => console.log('Hero sees:', entities),
});

// Apply movement strategy to NPC (e.g., seek and avoid hero)
movement.add(npc, new SeekAvoid(engine, () => hero, 180, 140, 80, 48));

// Game loop
function gameLoop() {
  // Update hero movement from input
  updateHeroFromInput(hero);
  
  // Step simulation
  engine.stepWithMovements();
  
  // Update zones
  zones.update();
  
  // Render
  render();
  
  requestAnimationFrame(gameLoop);
}
```

### Recommended Input Flow for Networked Games

1. Gather inputs for the next tick (direction, dash, attack, ...).
2. Apply them locally through `PhysicsEngine` (client-side prediction).
3. Send the input packet `{ tick, payload }` to the server.
4. When the authoritative snapshot comes back, restore it and replay any unconfirmed inputs using `stepOneTick`.

The included RPG example under `packages/physic/examples/rpg` demonstrates this loop with keyboard controls, NPC strategies, and debug UI using `PhysicsEngine` directly.

### Deprecated: TopDownPhysics

> **Note:** `TopDownPhysics` is deprecated. Use `PhysicsEngine` directly as shown above. The `TopDownPhysics` class was a convenience wrapper that is no longer recommended for new code.

## Zones

Zones allow detecting entities within circular or cone-shaped areas without physical collisions. This is useful for vision systems, skill ranges, explosions, area-of-effect abilities, and other gameplay mechanics that need to detect presence without triggering collision responses.

Zones can be:
- **Static**: Fixed position in the world
- **Attached**: Follow an entity's position (with optional offset)

Each zone can have:
- A circular or cone-shaped detection area (angle < 360° creates a cone)
- Optional line-of-sight checking (blocks through static entities)
- Event callbacks for entities entering/exiting the zone

### Basic Usage

```typescript
import { PhysicsEngine, ZoneManager } from '@rpgjs/physic';

const engine = new PhysicsEngine({ timeStep: 1/60 });
const zones = engine.getZoneManager();

// Create a static zone
const staticZone = zones.createZone({
  id: 'healing-fountain',
  position: { x: 100, y: 100 },
  radius: 50,
}, {
  onEnter: (entities) => console.log('Entities entered:', entities),
  onExit: (entities) => console.log('Entities exited:', entities),
});

// Create a zone attached to an entity
const player = engine.createEntity({
  position: { x: 0, y: 0 },
  radius: 10,
  mass: 1,
});

const visionZone = zones.createAttachedZone(player, {
  radius: 100,
  angle: 90, // 90-degree cone
  direction: 'right',
  offset: { x: 0, y: 0 }, // Optional offset from entity position
}, {
  onEnter: (entities) => console.log('Player sees:', entities),
  onExit: (entities) => console.log('Player lost sight of:', entities),
});

// Update zones after each physics step
function gameLoop() {
  engine.step();
  zones.update(); // Important: call update after step
  // ... render entities
}
```

### Zone Configuration

- `id`: Optional stable zone identifier (auto-generated when omitted)
- `radius`: Detection radius in world units
- `angle`: Cone angle in degrees (360 = full circle, < 360 = cone)
- `direction`: Direction for cone-shaped zones (`'up' | 'down' | 'left' | 'right'`)
- `limitedByWalls`: If true, line-of-sight is required (static entities block detection)
- `offset`: For attached zones, offset from entity position
- `metadata`: Optional custom data attached to the zone

### Updating Zones

**Important:** Always call `zones.update()` after each physics step to keep zones synchronized:

```typescript
engine.step();
zones.update(); // Zones are calculated on post-step state
```

This ensures zones detect entities based on their positions after physics simulation, maintaining determinism.

### Querying Zones

```typescript
// Get all entities currently in a zone
const entities = zones.getEntitiesInZone(visionZoneId);

// Update zone configuration
zones.updateZone(visionZoneId, { radius: 150, angle: 120 });

// Remove a zone
zones.removeZone(visionZoneId);
```

### Using Zones with PhysicsEngine

The `ZoneManager` exposed by `PhysicsEngine` is a generic system that works with any `Entity` and can be used independently for vision, skills, explosions, and other gameplay mechanics on both client and server. This is the recommended approach for all zone-based detection in RPG games.

## Tile Grid System

The engine includes a built-in tile grid system for grid-based logic, such as tile-based movement, triggers, or blocking specific areas (e.g., water, lava).

### Configuration

Configure the tile size in the `PhysicsEngine` constructor:

```typescript
const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  tileWidth: 32,  // Default: 32
  tileHeight: 32, // Default: 32
});
```

### Tile Hooks

Entities have hooks to react to tile changes:

```typescript
// Triggered when entering a new tile
entity.onEnterTile(({ x, y }) => {
  console.log(`Entered tile [${x}, ${y}]`);
});

// Triggered when leaving a tile
entity.onLeaveTile(({ x, y }) => {
  console.log(`Left tile [${x}, ${y}]`);
});

// Check if entity can enter a tile (return false to block movement)
entity.canEnterTile(({ x, y }) => {
  if (isWater(x, y)) {
    return false; // Block movement
  }
  return true;
});
```

The `currentTile` property on the entity stores the current tile coordinates:

```typescript
console.log(entity.currentTile); // Vector2(10, 5)
```

## Vision Blocking (Raycasting)

The engine supports raycasting for vision blocking and line-of-sight checks.

### Raycasting API

You can perform raycasts directly via the `PhysicsEngine` or `World`:

```typescript
import { Ray } from '@rpgjs/physic';

const hit = engine.raycast(
  startPosition,
  direction,
  maxDistance,
  collisionMask, // Optional mask
  (entity) => entity !== self // Optional filter
);

if (hit) {
  console.log('Hit entity:', hit.entity.uuid);
  console.log('Hit point:', hit.point);
  console.log('Hit normal:', hit.normal);
  console.log('Distance:', hit.distance);
}
```

### Vision Zones with Line of Sight

Zones can be configured to respect walls using `limitedByWalls: true`. This uses raycasting internally to check if entities are visible.

```typescript
const visionZone = zones.createAttachedZone(hero, {
  radius: 150,
  angle: 120,
  limitedByWalls: true, // Enable line-of-sight checks
}, {
  onEnter: (entities) => console.log('Seen:', entities),
});
```

Static entities (mass = 0 or Infinity) act as blockers for line-of-sight.

## Examples

- [Canvas Example](./examples/canvas/) - Interactive HTML5 Canvas demo (run with `npm run example`)
- [Basic Usage](./examples/basic.ts) - Simple physics simulation
- [Static Obstacles](./examples/static-obstacles.ts) - Creating immovable obstacles for RPG games
- [Regions](./examples/regions.ts) - Distributed simulation with regions
- [Forces](./examples/forces.ts) - Applying forces and constraints

## Architecture

The library is organized in layers:

1. **Core Math Layer**: Vectors, matrices, AABB, geometric utilities
2. **Physics Layer**: Entities, integrators, forces, constraints
3. **Collision Layer**: Colliders, detection, resolution, spatial hash
4. **World Layer**: World management, events, spatial partitioning
5. **Region Layer**: Multi-region simulation, entity migration
6. **API Layer**: High-level gameplay-oriented API

## API Reference

### PhysicsEngine

Main entry point for physics simulation.

```typescript
const engine = new PhysicsEngine({
  timeStep: 1 / 60,
  enableRegions: false,
  gravity: new Vector2(0, 0),
});

// Create entities
const entity = engine.createEntity({
  position: { x: 0, y: 0 },
  radius: 10,
  mass: 1,
});

// Step simulation
engine.step();

// Apply forces
engine.applyForce(entity, new Vector2(10, 0));

// Teleport entity
engine.teleport(entity, new Vector2(100, 200));
```

For RPG server loops, prefer the higher-level helpers when you only need
characters, rectangular map blockers, sensors, and per-frame inputs:

```typescript
const engine = new PhysicsEngine({ timeStep: 1 / 60 });

const hero = engine.createCharacter('hero-1', {
  x: 100,
  y: 100,
  hitbox: { width: 16, height: 24 },
  speed: 120,
});

engine.createStaticObstacle('tree-1', {
  x: 160,
  y: 100,
  width: 32,
  height: 32,
});

engine.createSensor('hero-vision', {
  entity: hero,
  radius: 96,
  onEnter: (entities) => {
    console.log('Seen:', entities.map((entity) => entity.uuid));
  },
});

// Apply authoritative server inputs and advance one fixed tick.
const tick = engine.stepFrame({
  'hero-1': 'right',
});
```

Available RPG helpers:

- `createCharacter(id, { x, y, hitbox, speed })` creates a dynamic player/NPC body with a stable id.
- `createStaticObstacle(id, { x, y, width, height })` creates an immovable map blocker.
- `createSensor(id, options)` creates a stable static or entity-attached zone.
- `moveEntity(idOrEntity, direction, speed?)` sets velocity from `'up'`, `'down'`, `'left'`, `'right'`, `'idle'`, or a vector.
- `teleportEntity(idOrEntity, position)` teleports and resynchronizes the broad phase.
- `stepFrame(inputs)` applies input directions, steps physics, updates sensors, and returns the new tick.

When you use engine helpers such as `teleport`, `freeze`, `unfreeze`, or
`assignPolygonCollider`, the engine automatically synchronizes the entity with
the spatial partition. If you mutate an entity manually, call `updateEntity`
before running spatial queries or relying on collisions:

```typescript
entity.position.set(128, 96);
entity.width = 32;
entity.height = 48;
engine.updateEntity(entity);
```

### Entity

Physical entities in the world.

```typescript
const entity = new Entity({
  position: { x: 0, y: 0 },
  velocity: { x: 5, y: 0 },
  radius: 10,
  mass: 1,
  restitution: 0.8, // Bounciness
  friction: 0.3,
});

// Apply forces
entity.applyForce(new Vector2(10, 0));
entity.applyImpulse(new Vector2(5, 0));

// Control state
entity.freeze(); // Make static
entity.sleep(); // Put to sleep
entity.wakeUp(); // Wake up
entity.stopMovement(); // Stop all movement immediately (keeps entity dynamic)
```

#### Per-entity Hooks

`Entity` exposes local hooks so you can react to collisions, position changes, direction changes, and movement state without diving into the global event bus.

- `onCollisionEnter` and `onCollisionExit` fire when the entity starts or stops colliding with another body.
- `onPositionChange` fires whenever the entity's position (x, y) changes. Useful for synchronizing rendering, network updates, or logging.
- `onDirectionChange` fires when the entity's direction changes, providing both the normalized direction vector and a simplified cardinal direction (`CardinalDirection`: `'left'`, `'right'`, `'up'`, `'down'`, or `'idle'`).
- `onMovementChange` fires when the entity starts or stops moving (based on velocity threshold). Provides `isMoving` boolean and `intensity` (speed magnitude in pixels/second) for fine-grained animation control. Useful for animations, gameplay reactions, or network sync.

You can also manually trigger these hooks using `notifyPositionChange()`, `notifyDirectionChange()`, and `notifyMovementChange()` when modifying position or velocity directly.

```typescript
const player = engine.createEntity({ position: { x: 0, y: 0 }, radius: 12, mass: 1 });

const stopWatchingCollision = player.onCollisionEnter(({ other }) => {
  console.log(`Player collided with ${other.uuid}`);
});

// Sync position changes for rendering or network updates
player.onPositionChange(({ x, y }) => {
  console.log(`Position changed to (${x}, ${y})`);
  // Update rendering, sync network, etc.
});

player.onDirectionChange(({ cardinalDirection, direction }) => {
  console.log(`Heading: ${cardinalDirection}`, direction);
  // Update sprite direction, sync network, etc.
});

// Detect when player starts or stops moving
player.onMovementChange(({ isMoving, intensity }) => {
  console.log(`Player is ${isMoving ? 'moving' : 'stopped'} at speed ${intensity.toFixed(1)} px/s`);
  
  // Update animations based on intensity
  if (isMoving && intensity > 100) {
    // Fast movement - use run animation
    playerAnimation = 'run';
  } else if (isMoving && intensity < 10) {
    // Slow movement - use walk animation (avoid flicker on micro-movements)
    playerAnimation = 'walk';
  } else if (!isMoving) {
    // Stopped - use idle animation
    playerAnimation = 'idle';
  }
  // Sync network, etc.
});

// Manually trigger position sync after direct modification
player.position.set(100, 200);
player.notifyPositionChange(); // Trigger sync hooks

// Manually trigger movement state sync after velocity modification
player.velocity.set(5, 0);
player.notifyMovementChange(); // Trigger sync hooks if state changed
```

Use the returned unsubscribe function to detach listeners when they are no longer needed.

### Movement System

The movement module provides reusable strategies and a manager that plugs into the physics engine.

```typescript
import {
  PhysicsEngine,
  MovementManager,
  Dash,
  LinearMove,
} from '@rpgjs/physic';

const engine = new PhysicsEngine({ timeStep: 1 / 60 });
const player = engine.createEntity({
  position: { x: 0, y: 0 },
  radius: 10,
  mass: 1,
});

const movement = engine.getMovementManager();

movement.add(player, new Dash(8, { x: 1, y: 0 }, 0.2));
movement.add(player, new LinearMove({ x: 0, y: 3 }, 1.5));

function loop() {
  engine.stepWithMovements();
  requestAnimationFrame(loop);
}

loop();
```

- `MovementManager` accepts entities directly or can be instantiated with a resolver (`MovementManager.forEngine(engine)` is used internally by `PhysicsEngine`).
- Strategies consume the generic `MovementBody` interface so you can wrap custom bodies; `@rpgjs/common` exposes an adapter for Matter.js hitboxes.
- Call `movement.update(dt)` manually when you need custom timing, or use `engine.stepWithMovements(dt)` to update movements and advance the simulation in one call.
- Use `movement.stopMovement(entity)` to completely stop an entity's movement, clearing all strategies and stopping velocity (useful when changing maps or teleporting).

#### Awaiting Movement Completion

The `add()` method returns a Promise that resolves when the movement completes (when `isFinished()` returns true). This allows you to chain movements or execute code after a movement finishes:

```typescript
// Wait for a dash to complete
await movement.add(player, new Dash(8, { x: 1, y: 0 }, 0.2));
console.log('Dash completed!');

// Chain multiple movements
await movement.add(player, new Dash(8, { x: 1, y: 0 }, 0.2));
await movement.add(player, new Dash(8, { x: 0, y: 1 }, 0.2));
console.log('Both dashes completed!');
```

#### Movement Callbacks

You can pass `MovementOptions` to the `add()` method for lifecycle callbacks:

```typescript
import { MovementOptions, Knockback } from '@rpgjs/physic';

// Apply knockback with callbacks
await movement.add(player, new Knockback({ x: -1, y: 0 }, 5, 0.3), {
  onStart: () => {
    // Called when the movement starts (first update)
    player.directionFixed = true;
    player.animationFixed = true;
    console.log('Knockback started!');
  },
  onComplete: () => {
    // Called when the movement completes
    player.directionFixed = false;
    player.animationFixed = false;
    console.log('Knockback finished!');
  }
});
```

The `MovementOptions` interface:

```typescript
interface MovementOptions {
  /** Callback executed when the movement starts (first update call) */
  onStart?: () => void;
  
  /** Callback executed when the movement completes (isFinished returns true) */
  onComplete?: () => void;
}
```

**Note:** If the strategy doesn't implement `isFinished()`, the Promise resolves immediately after the strategy is added, and `onComplete` will not be called automatically.

### Static Obstacles

Create immovable obstacles (walls, trees, decorations) by setting `mass` to `0` or `Infinity`. 
Static entities will block other entities without being pushed.

```typescript
// Dynamic player character
const player = engine.createEntity({
  position: { x: 0, y: 0 },
  radius: 10,
  mass: 1, // Normal mass for dynamic entity
});

// Static wall obstacle (cannot be pushed)
const wall = engine.createEntity({
  position: { x: 100, y: 0 },
  width: 20,
  height: 100,
  mass: Infinity, // Immovable obstacle
});

// Alternative: use mass = 0
const tree = engine.createEntity({
  position: { x: 200, y: 0 },
  radius: 15,
  mass: 0, // Also makes it immovable
});

// Player will be blocked by obstacles, but obstacles won't move
```

### Forces

Apply various forces to entities.

```typescript
import { applyAttraction, applyRepulsion, applyExplosion } from '@rpgjs/physic';

// Attract entity to point
applyAttraction(entity, targetPoint, strength, maxDistance);

// Repel entity from point
applyRepulsion(entity, sourcePoint, strength, maxDistance);

// Explosion force
applyExplosion(entity, center, strength, radius, falloff);
```

### Constraints

Connect entities with constraints.

```typescript
import { SpringConstraint, DistanceConstraint, AnchorConstraint } from '@rpgjs/physic';

// Spring between two entities
const spring = new SpringConstraint(entity1, entity2, restLength, stiffness, damping);
spring.update(deltaTime);

// Distance constraint
const distance = new DistanceConstraint(entity1, entity2, targetDistance, stiffness);
distance.update(deltaTime);

// Anchor entity to point
const anchor = new AnchorConstraint(entity, anchorPoint, stiffness);
anchor.update(deltaTime);
```

### Regions

Distributed simulation across regions.

```typescript
const engine = new PhysicsEngine({
  enableRegions: true,
  regionConfig: {
    worldBounds: new AABB(0, 0, 1000, 1000),
    regionSize: 200,
    overlap: 20,
    autoActivate: true,
  },
});

// Entities automatically migrate between regions
const entity = engine.createEntity({ position: { x: 100, y: 100 }, radius: 10 });
```

## Performance

The library is optimized for:
- **1000 dynamic entities** at 60 FPS
- **10000 static entities** supported
- **Spatial hash** for O(n) collision detection
- **Sleep system** for inactive entities
- **Object pooling** ready (utilities provided)

## Determinism

All physics operations are deterministic. Same inputs will produce same outputs across platforms, making it suitable for:
- Network synchronization
- Replay systems
- Testing and debugging

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run benchmarks (separate from tests)
npm run benchmark          # Run all benchmarks
npm run benchmark:1000    # 1000 entities benchmark
npm run benchmark:10000   # 10000 static entities benchmark
npm run benchmark:collisions  # Collision detection benchmark
npm run benchmark:regions     # Region-based simulation benchmark
```

## Building

```bash
# Build library
npm run build

# Type check
npm run typecheck

# Generate documentation
npm run docs
```

## Examples

```bash
# Run interactive canvas example
npm run example
```

This will start a Vite dev server and open the canvas example in your browser.

## Documentation

Full API documentation is available after building:

```bash
npm run docs
```

Documentation will be generated in the `docs/` directory.

## License

MIT
