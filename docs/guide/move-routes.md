---
title: "Move Routes"
description: "Guide for Move Routes in RPGJS."
---

# Move Routes

The `moveRoutes` method allows you to give a character (player or event) a sequence of movement instructions to follow. This is useful for creating patrol paths, scripted movements, or complex movement patterns.

## Basic Usage

The `moveRoutes` method accepts an array of movement instructions and returns a Promise that resolves when all routes are completed.

```ts
import { Move, Direction } from '@rpgjs/server'

// Move right, then down, then left
await player.moveRoutes([
  Move.right(),
  Move.down(),
  Move.left()
])
```

## Movement Instructions

### Direction Enums

You can use the `Direction` enum directly:

```ts
import { Direction } from '@rpgjs/common'

await player.moveRoutes([
  Direction.Right,
  Direction.Down,
  Direction.Left,
  Direction.Up
])
```

### Move Helper Functions

The `Move` object provides convenient helper functions for common movements:

```ts
import { Move } from '@rpgjs/server'

// Basic movements
await player.moveRoutes([
  Move.right(),   // Move right 1 step
  Move.left(),    // Move left 1 step
  Move.up(),      // Move up 1 step
  Move.down()     // Move down 1 step
])

// Move multiple steps
await player.moveRoutes([
  Move.right(3),  // Move right 3 steps
  Move.down(2)    // Move down 2 steps
])

// Random movement
await player.moveRoutes([
  Move.random(5)  // Move randomly 5 times
])
```

### Tile-Based Movements

Tile movements calculate the distance based on tile size and player speed:

```ts
// Move by tiles instead of steps
await player.moveRoutes([
  Move.tileRight(),  // Move right by 1 tile
  Move.tileDown(2),  // Move down by 2 tiles
  Move.tileLeft(),   // Move left by 1 tile
  Move.tileUp()      // Move up by 1 tile
])
```

### Turn Commands

Turn commands change the character's direction without moving:

```ts
await player.moveRoutes([
  Move.turnRight(),  // Turn right
  Move.turnDown(),   // Turn down
  Move.turnLeft(),   // Turn left
  Move.turnUp()      // Turn up
])
```

### Wait/Delay

You can add delays between movements:

```ts
await player.moveRoutes([
  Move.right(),
  Move.wait(0.5),  // Wait 0.5 seconds
  Move.down(),
  Move.wait(1.0)   // Wait 1 second
])
```

### Callback Functions

You can use callback functions to generate dynamic routes:

```ts
await player.moveRoutes([
  (player, map) => {
    // Generate route based on current state
    if (player.hp < 50) {
      return Move.left(3)  // Retreat if low HP
    }
    return Move.right(2)   // Advance otherwise
  },
  Move.down()
])
```

### Nested Arrays

Routes can be nested and will be automatically flattened:

```ts
await player.moveRoutes([
  [Move.right(), Move.right()],  // Move right twice
  [Move.down(), Move.down()]    // Move down twice
])
```

## Advanced Features

### Stuck Detection

When a character gets blocked by an obstacle or collision, you can handle it using the `onStuck` callback:

```ts
await player.moveRoutes([Move.right(5)], {
  onStuck: (player, target, currentPosition) => {
    console.log('Player is stuck!')
    console.log('Target:', target)
    console.log('Current position:', currentPosition)
    
    // Return false to cancel the route
    return false
  },
  stuckTimeout: 500,    // Time in ms before considering stuck (default: 500)
  stuckThreshold: 1     // Minimum distance change to consider progress (default: 1 pixel)
})
```

#### Stuck Detection Options

- **`onStuck`**: Callback function called when the player is blocked
  - Parameters:
    - `player`: The player instance that is stuck
    - `target`: The target position the player was trying to reach
    - `currentPosition`: The current position of the player
  - Return value:
    - `false` or `undefined`: Cancel the route
    - `true`: Continue trying to reach the target

- **`stuckTimeout`**: Time in milliseconds to wait before considering the player stuck (default: 500ms)
  - The player must be unable to make progress for this duration before `onStuck` is called

- **`stuckThreshold`**: Minimum distance change in pixels to consider movement progress (default: 1 pixel)
  - If the player moves less than this distance over the `stuckTimeout` period, they are considered stuck

#### Example: Handling Obstacles

```ts
// Player tries to move but gets blocked by a wall
await player.moveRoutes([Move.right(10)], {
  onStuck: (player, target, currentPos) => {
    // Try an alternative path
    player.moveRoutes([Move.up(5), Move.right(10), Move.down(5)])
    return false  // Cancel the original route
  },
  stuckTimeout: 300
})
```

#### Example: Continue After Obstacle Removal

```ts
let obstacleRemoved = false

await player.moveRoutes([Move.right(10)], {
  onStuck: (player, target, currentPos) => {
    // Remove obstacle and continue
    if (!obstacleRemoved) {
      removeObstacle()
      obstacleRemoved = true
      return true  // Continue the route
    }
    return false  // Give up if still stuck
  }
})
```

## Combining Movement Types

You can combine different movement types in a single route:

```ts
await player.moveRoutes([
  Move.turnRight(),      // Turn right
  Move.right(3),         // Move right 3 steps
  Move.wait(0.5),       // Wait half a second
  Move.turnDown(),       // Turn down
  Move.tileDown(2),      // Move down 2 tiles
  Move.turnLeft(),       // Turn left
  Move.left()            // Move left 1 step
])
```

## Player Movement

For player-specific movements, you can use callbacks to check player state:

```ts
await player.moveRoutes([
  Move.right(),
  (player, map) => {
    // Check if player can see an enemy
    const enemies = map.getPlayers().filter(p => p.team !== player.team)
    if (enemies.length > 0) {
      return Move.turnTowardPlayer(enemies[0])  // Turn toward nearest enemy
    }
    return Move.down()
  }
])
```

## Event Movement

Events can also use moveRoutes for patrol patterns:

```ts
// In your event definition
const GuardEvent = () => {
  return {
    name: 'Guard',
    onInit(event) {
      // Start infinite patrol
      event.infiniteMoveRoute([
        Move.right(5),
        Move.turnDown(),
        Move.down(5),
        Move.turnLeft(),
        Move.left(5),
        Move.turnUp(),
        Move.up(5),
        Move.turnRight()
      ])
    }
  }
}
```

## Infinite Routes

For characters that need to repeat a movement pattern indefinitely:

```ts
// Start infinite route
player.infiniteMoveRoute([
  Move.right(3),
  Move.down(3),
  Move.left(3),
  Move.up(3)
])

// Stop the infinite route
player.breakRoutes()

// Force stop immediately
player.breakRoutes(true)

// Replay the infinite route
player.replayRoutes()
```

## Route Completion

The `moveRoutes` method returns a Promise that resolves when all routes are completed:

```ts
const routePromise = player.moveRoutes([Move.right(5)])

routePromise.then(() => {
  console.log('Route completed!')
}).catch((error) => {
  console.error('Route failed:', error)
})

// Or use async/await
try {
  await player.moveRoutes([Move.right(5)])
  console.log('Route completed!')
} catch (error) {
  console.error('Route failed:', error)
}
```