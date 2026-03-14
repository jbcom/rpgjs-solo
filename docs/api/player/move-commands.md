---
title: "Move Commands"
description: "Movement APIs, movement strategies, and move route helpers."
---

# Move Commands

Movement APIs, movement strategies, and move route helpers.

## Members

- [addMovement](#addmovement)
- [animationFixed](#animationfixed)
- [applyIceMovement](#applyicemovement)
- [breakRoutes](#breakroutes)
- [clearMovements](#clearmovements)
- [dash](#dash)
- [directionFixed](#directionfixed)
- [followPath](#followpath)
- [frequency](#frequency)
- [getActiveMovements](#getactivemovements)
- [hasActiveMovements](#hasactivemovements)
- [infiniteMoveRoute](#infinitemoveroute)
- [knockback](#knockback)
- [moveRoutes](#moveroutes)
- [moveTo](#moveto)
- [oscillate](#oscillate)
- [removeMovement](#removemovement)
- [replayRoutes](#replayroutes)
- [shootProjectile](#shootprojectile)
- [stopMoveTo](#stopmoveto)
- [through](#through)
- [throughEvent](#throughevent)
- [throughOtherPlayer](#throughotherplayer)

## addMovement

Add a custom movement strategy to this entity

Returns a Promise that resolves when the movement completes.

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
addMovement(strategy: MovementStrategy, options?: MovementOptions): Promise<void>
```

### Parameters

- `strategy`: `MovementStrategy`
- `options?`: `MovementOptions`

### Returns

Promise that resolves when the movement completes

## animationFixed

Whether animation changes are locked (prevents automatic animation changes)

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `property`
- Defined in: `IMoveManager`

### Signature

```ts
animationFixed: boolean
```

## applyIceMovement

Apply ice movement physics

Max speed is calculated from the player's base speed multiplied by the speedFactor.

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
applyIceMovement(direction: { x: number, y: number }, speedFactor?: number): void
```

### Parameters

- `direction`: `{ x: number, y: number }`
- `speedFactor?`: `number`

## breakRoutes

Stop an infinite movement

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
breakRoutes(force?: boolean): void
```

### Parameters

- `force?`: `boolean`

## clearMovements

Remove all active movement strategies from this entity

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
clearMovements(): void
```

## dash

Perform a dash movement in the specified direction

The total speed is calculated by adding the player's base speed to the additional speed.
Returns a Promise that resolves when the dash completes.

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
dash(direction: { x: number, y: number }, additionalSpeed?: number, duration?: number, options?: MovementOptions): Promise<void>
```

### Parameters

- `direction`: `{ x: number, y: number }`
- `additionalSpeed?`: `number`
- `duration?`: `number`
- `options?`: `MovementOptions`

### Returns

Promise that resolves when the dash completes

## directionFixed

Whether direction changes are locked (prevents automatic direction changes)

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `property`
- Defined in: `IMoveManager`

### Signature

```ts
directionFixed: boolean
```

## followPath

Follow a sequence of waypoints

Speed is calculated from the player's base speed multiplied by the speedMultiplier.

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
followPath(waypoints: Array<{ x: number, y: number }>, speedMultiplier?: number, loop?: boolean): void
```

### Parameters

- `waypoints`: `Array<{ x: number, y: number }>`
- `speedMultiplier?`: `number`
- `loop?`: `boolean`

## frequency

Frequency for movement timing (milliseconds between movements)

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `property`
- Defined in: `IMoveManager`

### Signature

```ts
frequency: number
```

## getActiveMovements

Get all active movement strategies for this entity

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
getActiveMovements(): MovementStrategy[]
```

### Returns

Array of active movement strategies

## hasActiveMovements

Check if this entity has any active movement strategies

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
hasActiveMovements(): boolean
```

### Returns

True if entity has active movements

## infiniteMoveRoute

Give a path that repeats itself in a loop to a character

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
infiniteMoveRoute(routes: Routes): void
```

### Parameters

- `routes`: `Routes`

## knockback

Apply knockback effect in the specified direction

The force is scaled by the player's base speed for consistent behavior.
Returns a Promise that resolves when the knockback completes.

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
knockback(direction: { x: number, y: number }, force?: number, duration?: number, options?: MovementOptions): Promise<void>
```

### Parameters

- `direction`: `{ x: number, y: number }`
- `force?`: `number`
- `duration?`: `number`
- `options?`: `MovementOptions`

### Returns

Promise that resolves when the knockback completes

## moveRoutes

Give an itinerary to follow using movement strategies

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
moveRoutes(routes: Routes, options?: MoveRoutesOptions): Promise<boolean>
```

### Parameters

- `routes`: `Routes`
- `options?`: `MoveRoutesOptions`

### Returns

Promise that resolves when all routes are completed

## moveTo

Move toward a target player or position using AI pathfinding

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
moveTo(target: RpgCommonPlayer | { x: number, y: number }): void
```

### Parameters

- `target`: `RpgCommonPlayer | { x: number, y: number }`

## oscillate

Apply oscillating movement pattern

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
oscillate(direction: { x: number, y: number }, amplitude?: number, period?: number): void
```

### Parameters

- `direction`: `{ x: number, y: number }`
- `amplitude?`: `number`
- `period?`: `number`

## removeMovement

Remove a specific movement strategy from this entity

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
removeMovement(strategy: MovementStrategy): boolean
```

### Parameters

- `strategy`: `MovementStrategy`

### Returns

True if the strategy was found and removed

## replayRoutes

Replay an infinite movement

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
replayRoutes(): void
```

## shootProjectile

Shoot a projectile in the specified direction

Speed is calculated from the player's base speed multiplied by the speedFactor.

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
shootProjectile(type: ProjectileType, direction: { x: number, y: number }, speedFactor?: number): void
```

### Parameters

- `type`: `ProjectileType`
- `direction`: `{ x: number, y: number }`
- `speedFactor?`: `number`

## stopMoveTo

Stop the current moveTo behavior

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `method`
- Defined in: `IMoveManager`

### Signature

```ts
stopMoveTo(): void
```

## through

Whether the player goes through all characters (players and events)

When `true`, the player can walk through all character entities (both players and events)
without collision. Walls and obstacles still block movement.
This takes precedence over `throughOtherPlayer` and `throughEvent`.

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `property`
- Defined in: `IMoveManager`

### Signature

```ts
through: boolean
```

### Default

```ts
false
```

### Examples

```ts
// Enable ghost mode - pass through all characters
player.through = true;

// Disable ghost mode
player.through = false;
```

## throughEvent

Whether the player passes through events (NPCs, objects)

When `true`, the player can walk through event entities without collision.
This is useful for NPCs that shouldn't block player movement.

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `property`
- Defined in: `IMoveManager`

### Signature

```ts
throughEvent: boolean
```

### Default

```ts
false
```

### Examples

```ts
// Allow passing through events
player.throughEvent = true;

// Block passage through events
player.throughEvent = false;
```

## throughOtherPlayer

Whether the player passes through other players

When `true`, the player can walk through other player entities without collision.
This is useful for busy areas where players shouldn't block each other.

- Source: `packages/server/src/Player/MoveManager.ts`
- Kind: `property`
- Defined in: `IMoveManager`

### Signature

```ts
throughOtherPlayer: boolean
```

### Default

```ts
true
```

### Examples

```ts
// Disable player-to-player collision
player.throughOtherPlayer = true;

// Enable player-to-player collision
player.throughOtherPlayer = false;
```
