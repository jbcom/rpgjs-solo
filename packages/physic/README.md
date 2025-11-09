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
```

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

