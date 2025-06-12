# Movement System Guide

The RPGJS movement system provides a flexible and extensible way to handle entity movement in your game. This guide covers how to use the built-in movement strategies and how to create custom ones.

## Overview

The movement system is built around the **Strategy Pattern**, separating movement logic from physics simulation. This allows you to:

- Combine multiple movement strategies on a single entity
- Create complex movement patterns by composing simple ones
- Add custom movement behaviors without modifying existing code
- Handle time-based movements that work regardless of frame rate

## Architecture

```
┌─────────────────┐       ┌───────────────────┐         ┌───────────────┐
│ Game Logic /    │ uses  │ MovementStrategy  │ applies │ Matter.js     │
│ Input / AI      │──────▶│ (calculates dx,dy)│─────────▶ Physics       │
└─────────────────┘       └───────────────────┘         └───────────────┘
```

## Using the Movement System

The movement system can be used in two ways:

```typescript
import { RpgPlayer, type RpgServer } from "@rpgjs/server";
import { 
  LinearMove, 
  Dash, 
  Knockback, 
  PathFollow, 
  Oscillate,
  SeekAvoid,
  ProjectileType 
} from "@rpgjs/common";

// In hooks or player events
export default defineModule<RpgServer>({
  onInput(player: RpgPlayer, { input }) {
    if (input.includes('action')) {
      player.knockback({ x: -1, y: 0 }, 5, 300);
    }
  }
})
```

### Core Movement Methods

#### Required Imports

```typescript
import { RpgPlayer } from "@rpgjs/server";
import { 
  LinearMove, 
  Dash, 
  Knockback, 
  PathFollow, 
  Oscillate,
  CompositeMovement,
  SeekAvoid,
  LinearRepulsion,
  IceMovement,
  ProjectileMovement,
  ProjectileType,
  MovementStrategy 
} from "@rpgjs/common";
```

#### Managing Movement Strategies

```typescript
// Add a custom movement strategy
player.addMovement(new LinearMove(5, 0, 1000));

// Remove a specific movement
const dashMove = new Dash(8, { x: 1, y: 0 }, 200);
player.addMovement(dashMove);
player.removeMovement(dashMove);

// Clear all movements
player.clearMovements();

// Check if entity has active movements
if (player.hasActiveMovements()) {
  console.log("Player is moving");
}

// Get all active movements
const movements = player.getActiveMovements();
console.log(`Player has ${movements.length} active movements`);
```

## Built-in Movement Strategies

### 1. Linear Movement

Constant velocity movement in a specified direction.

```typescript
// Move right at 5 pixels per frame for 1 second
player.addMovement(new LinearMove(5, 0, 1000));

// Move diagonally indefinitely
player.addMovement(new LinearMove(3, 3));
```

### 2. Dash Movement

Quick burst of speed in a direction for a limited time.

```typescript
// Dash right for 200ms at speed 8
player.dash({ x: 1, y: 0 }, 8, 200);

// Dash diagonally with custom parameters
player.dash({ x: 0.7, y: 0.7 }, 12, 300);
```

### 3. Knockback Effect

Push effect that gradually decreases over time.

```typescript
// Knockback from explosion
player.knockback({ x: -1, y: 0 }, 8, 400);

// Light knockback from attack
player.knockback(attackDirection, 3, 200);
```

### 4. Path Following

Follow a sequence of waypoints.

```typescript
// Create a patrol route
const patrolPoints = [
  { x: 100, y: 100 },
  { x: 300, y: 100 },
  { x: 300, y: 300 },
  { x: 100, y: 300 }
];

// Follow path once
player.followPath(patrolPoints, 3);

// Loop patrol indefinitely
player.followPath(patrolPoints, 3, true);
```

### 5. Oscillation

Back-and-forth movement patterns.

```typescript
// Horizontal oscillation
player.oscillate({ x: 1, y: 0 }, 100, 3000);

// Vertical oscillation
player.oscillate({ x: 0, y: 1 }, 50, 2000);

// Circular oscillation
player.oscillate({ x: 1, y: 0 }, 100, 4000, 'circular');
```

### 6. AI Pathfinding

Intelligent movement toward targets with obstacle avoidance.

```typescript
// Move toward another player
const targetPlayer = game.getPlayer('player2');
player.moveTo(targetPlayer);

// Move toward a specific position
player.moveTo({ x: 300, y: 200 });

// Stop the movement
player.stopMoveTo();
```

### 7. Ice Movement

Slippery surface physics with gradual acceleration and inertia.

```typescript
// Apply ice physics when on ice terrain
if (onIceTerrain) {
  player.applyIceMovement(inputDirection, 5);
}
```

### 8. Projectile Movement

Ballistic trajectories for projectiles.

```typescript
// Shoot arrow (straight line)
player.shootProjectile(ProjectileType.Straight, { x: 1, y: 0 }, 300);

// Throw grenade (arc trajectory)
player.shootProjectile(ProjectileType.Arc, { x: 0.7, y: 0.7 }, 150);

// Bouncing projectile
player.shootProjectile(ProjectileType.Bounce, { x: 1, y: 0 }, 100);
```

## Combining Movements

### Parallel Movements

Multiple movements can be active simultaneously:

```typescript
// Apply dash and oscillation at the same time
player.dash({ x: 1, y: 0 }, 8, 200);
player.oscillate({ x: 0, y: 1 }, 10, 1000);
```

### Sequential Movements

Chain movements using `CompositeMovement`:

```typescript
import { CompositeMovement, Dash, Knockback } from "@rpgjs/common";

// Create a sequence: dash forward, then knockback
const sequence = new CompositeMovement('sequence', [
  new Dash(8, { x: 1, y: 0 }, 200),
  new Knockback({ x: -0.5, y: 0 }, 3, 300)
]);

player.addMovement(sequence);
```

### Complex Combinations

```typescript
// Parallel movement: path following with oscillation
const complexMovement = new CompositeMovement('parallel', [
  new PathFollow(waypoints, 2),
  new Oscillate({ x: 0, y: 1 }, 10, 1000)
]);

player.addMovement(complexMovement);
```

## Creating Custom Movement Strategies

### Basic Custom Movement

Implement the `MovementStrategy` interface:

```typescript
import { MovementStrategy } from "@rpgjs/common";
import * as Matter from 'matter-js';

class CircularMovement implements MovementStrategy {
  private elapsed: number = 0;
  private centerX: number;
  private centerY: number;
  
  constructor(
    center: { x: number, y: number },
    private radius: number = 50,
    private speed: number = 0.05,
    private duration?: number
  ) {
    this.centerX = center.x;
    this.centerY = center.y;
  }
  
  update(body: Matter.Body, dt: number): void {
    this.elapsed += dt * this.speed;
    
    // Calculate circular position
    const x = this.centerX + Math.cos(this.elapsed) * this.radius;
    const y = this.centerY + Math.sin(this.elapsed) * this.radius;
    
    // Set velocity to reach target position
    const vx = (x - body.position.x) * 0.1;
    const vy = (y - body.position.y) * 0.1;
    
    Matter.Body.setVelocity(body, { x: vx, y: vy });
  }
  
  isFinished(): boolean {
    return this.duration !== undefined && this.elapsed >= this.duration;
  }
  
  onFinished?(): void {
    console.log("Circular movement completed");
  }
}

// Usage
const center = { x: 200, y: 200 };
player.addMovement(new CircularMovement(center, 75, 0.03, 5000));
```

## Best Practices

### Performance Considerations

1. **Limit Active Movements**: Too many simultaneous movements can impact performance
```typescript
// Check movement count before adding new ones
if (player.getActiveMovements().length < 3) {
  player.addMovement(newMovement);
}
```

2. **Clean Up Finished Movements**: The system automatically removes finished movements, but you can manually clean up if needed
```typescript
// Clear movements when changing states
player.clearMovements();
```

### Movement Coordination

1. **Check Before Adding**: Prevent conflicting movements
```typescript
if (!player.hasActiveMovements()) {
  player.dash(direction);
}
```

2. **State-Based Movement**: Use different movements for different game states
```typescript
switch (gameState) {
  case 'normal':
    player.addMovement(new LinearMove(vx, vy));
    break;
  case 'combat':
    player.dash(direction, 8, 200);
    break;
  case 'ice':
    player.applyIceMovement(direction, 4);
    break;
}
```

### Debugging Movements

```typescript
// Log active movements for debugging
const movements = player.getActiveMovements();
console.log('Active movements:', movements.map(m => m.constructor.name));

// Check specific movement types
const hasDash = movements.some(m => m instanceof Dash);
const hasKnockback = movements.some(m => m instanceof Knockback);
```