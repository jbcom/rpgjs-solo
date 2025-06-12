# Server Engine Hooks

Server engine hooks allow you to listen to server-level events and customize server behavior. These hooks are defined in the `engine` property of your server module.

## Usage

```ts
import { RpgServerEngine, RpgServerEngineHooks, defineModule } from '@rpgjs/server'

const engine: RpgServerEngineHooks = {
    onStart(server: RpgServerEngine) {
        console.log('Server is starting...')
    },
    onStep(server: RpgServerEngine) {
        // Called at each server frame (60 FPS)
    },
    auth(server: RpgServerEngine, socket: any) {
        // Custom authentication logic
        const token = socket.handshake.query.token
        if (!token) {
            throw 'Authentication failed: No token provided'
        }
        return 'user-id-123'
    }
}

export default defineModule({
    engine
})
```

## Available Hooks

### onStart

**Description:** Called when the server starts

**Parameters:**
- `server: RpgServerEngine` - The server engine instance

**Example:**
```ts
const engine: RpgServerEngineHooks = {
    onStart(server: RpgServerEngine) {
        console.log('Server started successfully')
        // Initialize global server data
        server.globalData = {
            startTime: Date.now(),
            playerCount: 0
        }
    }
}
```

### onStep

**Description:** Called at each server frame, typically representing 60 FPS

**Parameters:**
- `server: RpgServerEngine` - The server engine instance

**Example:**
```ts
const engine: RpgServerEngineHooks = {
    onStep(server: RpgServerEngine) {
        // Update global timers, check conditions, etc.
        const currentTime = Date.now()
        if (currentTime % 10000 === 0) { // Every 10 seconds
            console.log(`Server running for ${currentTime - server.globalData.startTime}ms`)
        }
    }
}
```

### auth

**Description:** Flexible authentication function for player connections. This function is called during the player connection phase and should handle credential verification.

**Parameters:**
- `server: RpgServerEngine` - The server engine instance
- `socket: any` - The socket instance for the connecting player

**Returns:**
- `Promise<string> | string | undefined` - Player's unique identifier if authentication succeeds, or undefined to generate an ID automatically

**Throws:**
- `string` - Error message if authentication fails

**Example:**
```ts
const engine: RpgServerEngineHooks = {
    async auth(server: RpgServerEngine, socket: any) {
        const token = socket.handshake.query.token
        
        if (!token) {
            throw 'Authentication failed: No token provided'
        }
        
        try {
            // Verify token with your authentication service
            const user = await verifyJWTToken(token)
            return user.id
        } catch (error) {
            throw 'Authentication failed: Invalid token'
        }
    }
}
```

## Complete Example

```ts
import { RpgServerEngine, RpgServerEngineHooks, defineModule } from '@rpgjs/server'
import { verifyJWTToken } from './auth-service'

const engine: RpgServerEngineHooks = {
    onStart(server: RpgServerEngine) {
        console.log('🚀 RPG Server started')
        server.globalData = {
            startTime: Date.now(),
            events: []
        }
    },
    
    onStep(server: RpgServerEngine) {
        // Process global events every frame
        if (server.globalData.events.length > 0) {
            const event = server.globalData.events.shift()
            console.log('Processing global event:', event)
        }
    },
    
    async auth(server: RpgServerEngine, socket: any) {
        const { token, guestMode } = socket.handshake.query
        
        if (guestMode === 'true') {
            // Allow guest connections
            return `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
        
        if (!token) {
            throw 'Authentication required'
        }
        
        try {
            const user = await verifyJWTToken(token)
            console.log(`User ${user.username} authenticated`)
            return user.id
        } catch (error) {
            throw 'Invalid authentication token'
        }
    }
}

export default defineModule({
    engine
})
``` 