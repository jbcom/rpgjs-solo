# Testing with @rpgjs/testing

The `@rpgjs/testing` package provides utilities to test your RPGJS modules and game logic in a controlled environment. It sets up both server and client instances, allowing you to test player interactions, server hooks, and game mechanics.

## Installation

The `@rpgjs/testing` package is already included in RPGJS projects. If you need to install it separately:

```bash
npm install @rpgjs/testing 
```

## Setup

### Vitest Configuration

To use the testing utilities, configure Vitest to use the setup file provided by `@rpgjs/testing`. This setup file automatically mocks WebGL, images, and media elements for testing in a Node.js environment.

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['@rpgjs/testing/dist/setup.js'],
    environment: 'node',
    globals: true
  }
})
```

The setup file automatically:
- Mocks WebGL canvas using `vitest-webgl-canvas-mock`
- Mocks image loading
- Mocks HTML media elements (audio/video)
- Creates a DOM container for the game

## Basic Usage

### Simple Test

The simplest way to test is to use the `testing()` function without any modules:

```typescript
import { testing } from '@rpgjs/testing'
import { beforeEach, test, expect } from 'vitest'
import { RpgPlayer } from '@rpgjs/server'

let player: RpgPlayer

beforeEach(async () => {
  const fixture = await testing()
  const client = await fixture.createClient()
  player = client.player
})

test('Player has default HP', () => {
  expect(player.hp).toBeGreaterThan(0)
})
```

### Understanding the Testing Fixture

The `testing()` function returns a fixture object with a `createClient()` method:

```typescript
const fixture = await testing()
const client = await fixture.createClient()
```

The `client` object provides access to:

- **`server`**: The RpgServer instance
- **`socket`**: The WebSocket connection
- **`client`**: The RpgClientEngine instance
- **`playerId`**: The unique identifier of the player
- **`player`**: A getter that returns the RpgPlayer instance

```typescript
const client = await fixture.createClient()

// Access the server
const server = client.server

// Access the client engine
const engine = client.client

// Access the player
const player = client.player

// Access the player ID
const playerId = client.playerId
```

## Testing with Custom Modules

You can test your custom modules by passing them to the `testing()` function:

```typescript
import { testing } from '@rpgjs/testing'
import { defineModule, createModule } from '@rpgjs/common'
import type { RpgServer, RpgClient } from '@rpgjs/server'

// Define your server module
const serverModule = defineModule<RpgServer>({
  player: {
    onConnected(player) {
      player.setVariable('test', 'value')
    }
  }
})

// Define your client module
const clientModule = defineModule<RpgClient>({
  // Client-side logic
})

// Create the module
const myModule = createModule('MyModule', [serverModule, clientModule])

// Use it in tests
beforeEach(async () => {
  const fixture = await testing([myModule])
  const client = await fixture.createClient()
  player = client.player
})

test('Module hook was called', () => {
  expect(player.getVariable('test')).toBe('value')
})
```

## Advanced Configuration

### Server Configuration

You can pass custom server configuration:

```typescript
const fixture = await testing([], {}, {
  providers: [
    // Custom server providers
  ],
  // Other server config options
})
```

### Client Configuration

You can pass custom client configuration:

```typescript
const fixture = await testing([], {
  providers: [
    // Custom client providers
  ],
  // Other client config options
})
```

### Complete Example

```typescript
import { testing } from '@rpgjs/testing'
import { beforeEach, test, expect } from 'vitest'
import { RpgPlayer } from '@rpgjs/server'
import { myModule } from './my-module'

let player: RpgPlayer
let server: any

beforeEach(async () => {
  const fixture = await testing(
    [myModule], // Modules
    { /* client config */ }, // Client configuration
    { /* server config */ }  // Server configuration
  )
  
  const client = await fixture.createClient()
  player = client.player
  server = client.server
})

test('Test player parameters', () => {
  expect(player.hp).toBeGreaterThan(0)
  expect(player.sp).toBeGreaterThan(0)
})

test('Test server-side logic', () => {
  // Access server methods
  const players = server.subRoom.players()
  expect(players).toHaveProperty(player.playerId)
})
```

## Testing Player Actions

You can test player actions and server hooks:

```typescript
import { testing } from '@rpgjs/testing'
import { beforeEach, test, expect } from 'vitest'
import { RpgPlayer } from '@rpgjs/server'

let player: RpgPlayer

beforeEach(async () => {
  const fixture = await testing()
  const client = await fixture.createClient()
  player = client.player
})

test('Player can move', async () => {
  const initialX = player.position.x
  
  // Simulate movement
  player.move({ x: 10, y: 0 })
  
  // Wait for movement to complete
  await new Promise(resolve => setTimeout(resolve, 100))
  
  expect(player.position.x).toBeGreaterThan(initialX)
})

test('Player can use items', () => {
  // Add an item to inventory
  player.addItem('potion', 1)
  
  // Use the item
  player.useItem('potion')
  
  expect(player.getItem('potion')).toBeUndefined()
})
```

## Testing Events and Hooks

Test server-side hooks and events:

```typescript
import { testing } from '@rpgjs/testing'
import { defineModule, createModule } from '@rpgjs/common'
import type { RpgServer } from '@rpgjs/server'
import { beforeEach, test, expect, vi } from 'vitest'

const serverModule = defineModule<RpgServer>({
  player: {
    onConnected(player) {
      player.setVariable('connected', true)
    },
    onLevelUp(player) {
      player.setVariable('leveledUp', true)
    }
  }
})

const testModule = createModule('TestModule', [serverModule])

let player: RpgPlayer

beforeEach(async () => {
  const fixture = await testing([testModule])
  const client = await fixture.createClient()
  player = client.player
})

test('onConnected hook was called', () => {
  expect(player.getVariable('connected')).toBe(true)
})

test('onLevelUp hook is called when leveling up', () => {
  const initialLevel = player.level
  player.level++
  
  expect(player.getVariable('leveledUp')).toBe(true)
})
```

## Testing Multiple Clients

You can create multiple clients to test multiplayer scenarios:

```typescript
import { testing } from '@rpgjs/testing'
import { beforeEach, test, expect } from 'vitest'

let fixture: any

beforeEach(async () => {
  fixture = await testing()
})

test('Multiple players can exist', async () => {
  const client1 = await fixture.createClient()
  const client2 = await fixture.createClient()
  
  expect(client1.playerId).not.toBe(client2.playerId)
  expect(client1.server).toBe(client2.server) // Same server instance
  
  const players = client1.server.subRoom.players()
  expect(Object.keys(players)).toHaveLength(2)
})
```

## Helper Functions

### `provideTestingLoadMap()`

This function provides a mock map loader for testing. It's automatically included when using `testing()`, but you can use it directly if needed:

```typescript
import { provideTestingLoadMap } from '@rpgjs/testing'

// Returns a provider that mocks map loading
const mapLoaderProvider = provideTestingLoadMap()
```

## Best Practices

1. **Use `beforeEach`**: Create a fresh fixture and client for each test to ensure isolation
2. **Test modules separately**: Create focused tests for individual modules
3. **Use async/await**: The `testing()` and `createClient()` functions are async
4. **Clean up**: The testing environment automatically cleans up between tests
5. **Mock external dependencies**: Use Vitest mocks for external services or APIs

## Example: Complete Test Suite

```typescript
import { testing } from '@rpgjs/testing'
import { beforeEach, describe, test, expect } from 'vitest'
import { RpgPlayer, MAXHP_CURVE, MAXSP_CURVE, MAXHP, MAXSP } from '@rpgjs/server'

describe('Player Parameters', () => {
  let player: RpgPlayer

  beforeEach(async () => {
    const fixture = await testing()
    const client = await fixture.createClient()
    player = client.player
  })

  test('Player has correct initial HP', () => {
    expect(player.hp).toBe(MAXHP_CURVE.start)
  })

  test('Player has correct initial SP', () => {
    expect(player.sp).toBe(MAXSP_CURVE.start)
  })

  test('Player has correct MaxHP parameter', () => {
    expect(player.param[MAXHP]).toBe(MAXHP_CURVE.start)
  })

  test('Player has correct MaxSP parameter', () => {
    expect(player.param[MAXSP]).toBe(MAXSP_CURVE.start)
  })
})
```

## Customizing Map Configuration in Tests

By default, `testing()` uses `provideTestingLoadMap()` which provides maps with default dimensions (1024x768) and a minimal mock component. If you need custom map configuration, you can pass your own `provideLoadMap` in `clientConfig.providers`:

```typescript
import { provideLoadMap } from '@rpgjs/client'

const fixture = await testing(
  [myModule],
  {
    providers: [
      provideLoadMap((mapId) => {
        return {
          id: mapId,
          data: { 
            width: 2048, 
            height: 1536,
            hitboxes: []
          },
          component: MyCustomComponent,
          width: 2048,
          height: 1536
        }
      })
    ]
  }
)
```

If you don't provide `provideLoadMap`, the default `provideTestingLoadMap()` will be used automatically.

## Troubleshooting

### Tests fail with WebGL errors

Make sure you've configured Vitest to use the setup file from `@rpgjs/testing`:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    setupFiles: ['@rpgjs/testing/dist/setup.js']
  }
})
```

### Player is undefined

Ensure you're calling `createClient()` and accessing `client.player` after the client is created:

```typescript
const client = await fixture.createClient()
const player = client.player // Access via getter
```

### Module hooks not being called

Verify that your modules are correctly structured and passed to the `testing()` function:

```typescript
const fixture = await testing([myModule]) // Don't forget the array
```

### Map component errors

If you see errors about missing map components or hitbox requirements, make sure you're either:
- Using the default `provideTestingLoadMap()` (automatically added if no custom `provideLoadMap` is provided)
- Or providing a complete `provideLoadMap` with `component`, `width`, `height`, and `data` properties
