# Client Engine Hooks

Client engine hooks allow you to listen to client-side events and customize client behavior. These hooks are defined in the `engine` property of your client module.

## Usage

```ts
import { RpgClientEngine, RpgClientEngineHooks, defineModule } from '@rpgjs/client'

const engine: RpgClientEngineHooks = {
    onStart(engine: RpgClientEngine) {
        console.log('Client engine started')
        return true // Allow connection to server
    },
    onStep(engine: RpgClientEngine, t: number, dt: number) {
        // Called each frame
    }
}

export default defineModule({
    engine
})
```

## Available Hooks

### onStart

**Description:** Called when the client engine starts. Return `false` to prevent connection to the server.

**Parameters:**
- `engine: RpgClientEngine` - The client engine instance

**Returns:**
- `boolean | void` - Return `false` to prevent server connection

**Example:**
```ts
const engine: RpgClientEngineHooks = {
    async onStart(engine: RpgClientEngine) {
        console.log('🎮 Client starting...')
        
        // Load global configuration
        try {
            const response = await fetch('/api/game-config')
            const config = await response.json()
            engine.globalConfig = config
            
            console.log('✅ Configuration loaded')
            return true // Allow connection
        } catch (error) {
            console.error('❌ Failed to load configuration:', error)
            return false // Prevent connection
        }
    }
}
```

### onStep

**Description:** Called at each frame (typically 60 FPS)

**Parameters:**
- `engine: RpgClientEngine` - The client engine instance
- `t: number` - Current timestamp
- `dt: number` - Delta time since last frame

**Example:**
```ts
const engine: RpgClientEngineHooks = {
    onStep(engine: RpgClientEngine, t: number, dt: number) {
        // Update custom animations
        if (engine.customAnimations) {
            engine.customAnimations.forEach(animation => {
                animation.update(dt)
            })
        }
        
        // Update UI elements
        if (engine.ui) {
            engine.ui.updateTimers(dt)
        }
        
        // Performance monitoring
        if (t % 1000 < dt) { // Every second
            const fps = Math.round(1000 / dt)
            if (fps < 30) {
                console.warn(`Low FPS detected: ${fps}`)
            }
        }
    }
}
```

### onInput

**Description:** Called when keyboard input is detected

**Parameters:**
- `engine: RpgClientEngine` - The client engine instance
- `obj: { input: string, playerId: number }` - Input data

**Example:**
```ts
const engine: RpgClientEngineHooks = {
    onInput(engine: RpgClientEngine, { input, playerId }) {
        console.log(`Input received: ${input} from player ${playerId}`)
        
        // Handle custom key bindings
        switch (input) {
            case 'F1':
                engine.gui('help').toggle()
                break
                
            case 'F2':
                engine.gui('debug').toggle()
                break
                
            case 'F11':
                engine.toggleFullscreen()
                break
                
            case 'screenshot':
                engine.takeScreenshot()
                break
                
            case 'chat':
                engine.gui('chat').focus()
                break
        }
        
        // Log input for analytics
        if (engine.analytics) {
            engine.analytics.logInput(input, playerId)
        }
    }
}
```

### onConnected

**Description:** Called when the client successfully connects to the server

**Parameters:**
- `engine: RpgClientEngine` - The client engine instance
- `socket: any` - The socket connection instance

**Example:**
```ts
const engine: RpgClientEngineHooks = {
    onConnected(engine: RpgClientEngine, socket: any) {
        console.log('🔗 Connected to server')
        
        // Show connection status
        engine.gui('notification').show({
            message: 'Connected to server',
            type: 'success',
            duration: 3000
        })
        
        // Initialize client-side systems
        engine.initializeChat()
        engine.initializeAudio()
        engine.initializeParticles()
        
        // Send client information
        socket.emit('client-info', {
            version: engine.version,
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            screenResolution: {
                width: screen.width,
                height: screen.height
            }
        })
        
        // Start heartbeat
        engine.startHeartbeat(socket)
    }
}
```

### onDisconnect

**Description:** Called when the client disconnects from the server

**Parameters:**
- `engine: RpgClientEngine` - The client engine instance
- `reason: any` - Disconnection reason
- `socket: any` - The socket connection instance

**Example:**
```ts
const engine: RpgClientEngineHooks = {
    onDisconnect(engine: RpgClientEngine, reason: any, socket: any) {
        console.log('🔌 Disconnected from server:', reason)
        
        // Show disconnection message
        engine.gui('notification').show({
            message: `Disconnected: ${reason}`,
            type: 'error',
            duration: 5000
        })
        
        // Stop client-side systems
        engine.stopHeartbeat()
        engine.pauseAudio()
        engine.clearParticles()
        
        // Show reconnection dialog
        engine.gui('reconnect-dialog').open({
            reason: reason,
            onReconnect: () => {
                engine.reconnect()
            }
        })
        
        // Save offline data
        engine.saveOfflineData()
    }
}
```

### onConnectError

**Description:** Called when there's an error connecting to the server

**Parameters:**
- `engine: RpgClientEngine` - The client engine instance
- `err: any` - The connection error
- `socket: any` - The socket connection instance

**Example:**
```ts
const engine: RpgClientEngineHooks = {
    onConnectError(engine: RpgClientEngine, err: any, socket: any) {
        console.error('❌ Connection error:', err)
        
        // Show error message
        engine.gui('error-dialog').open({
            title: 'Connection Failed',
            message: 'Unable to connect to the game server. Please check your internet connection and try again.',
            error: err.message,
            actions: [
                {
                    label: 'Retry',
                    action: () => engine.reconnect()
                },
                {
                    label: 'Offline Mode',
                    action: () => engine.startOfflineMode()
                }
            ]
        })
        
        // Log error for debugging
        if (engine.errorLogger) {
            engine.errorLogger.log({
                type: 'connection_error',
                error: err,
                timestamp: Date.now(),
                userAgent: navigator.userAgent
            })
        }
    }
}
```

### onWindowResize

**Description:** Called when the browser window is resized

**Example:**
```ts
const engine: RpgClientEngineHooks = {
    onWindowResize() {
        console.log('🖥️ Window resized')
        
        // Update viewport
        const newWidth = window.innerWidth
        const newHeight = window.innerHeight
        
        // Adjust game canvas
        if (engine.renderer) {
            engine.renderer.resize(newWidth, newHeight)
        }
        
        // Update UI layout
        if (engine.ui) {
            engine.ui.updateLayout(newWidth, newHeight)
        }
        
        // Adjust camera
        if (engine.camera) {
            engine.camera.updateViewport(newWidth, newHeight)
        }
        
        // Save new dimensions
        localStorage.setItem('gameWindowSize', JSON.stringify({
            width: newWidth,
            height: newHeight
        }))
    }
}
```

## Complete Example

```ts
import { RpgClientEngine, RpgClientEngineHooks, defineModule } from '@rpgjs/client'

const engine: RpgClientEngineHooks = {
    async onStart(engine: RpgClientEngine) {
        console.log('🎮 Starting RPG Client...')
        
        // Load game configuration
        try {
            const slug = 'my-game-project'
            const response = await fetch(`/api/game/project/${slug}`)
            const config = await response.json()
            
            engine.globalConfig = config
            engine.gameVersion = config.version
            
            // Initialize client systems
            engine.analytics = new GameAnalytics(config.analyticsKey)
            engine.errorLogger = new ErrorLogger(config.errorReportingUrl)
            
            console.log('✅ Client initialized successfully')
            return true
            
        } catch (error) {
            console.error('❌ Failed to initialize client:', error)
            return false
        }
    },
    
    onStep(engine: RpgClientEngine, t: number, dt: number) {
        // Update performance metrics
        engine.performanceMonitor?.update(dt)
        
        // Update custom systems
        engine.particleSystem?.update(dt)
        engine.audioManager?.update(dt)
        
        // Auto-save progress every 30 seconds
        if (t % 30000 < dt) {
            engine.autoSave()
        }
    },
    
    onInput(engine: RpgClientEngine, { input, playerId }) {
        // Handle debug commands
        if (engine.debugMode) {
            switch (input) {
                case 'F3':
                    engine.gui('debug-info').toggle()
                    break
                case 'F4':
                    engine.toggleWireframe()
                    break
            }
        }
        
        // Handle screenshot
        if (input === 'F12') {
            engine.takeScreenshot()
        }
    },
    
    onConnected(engine: RpgClientEngine, socket: any) {
        console.log('🌐 Connected to game server')
        
        // Initialize multiplayer features
        engine.chat.enable()
        engine.voiceChat.initialize()
        
        // Send client capabilities
        socket.emit('client-capabilities', {
            webGL: engine.renderer.isWebGL,
            audioContext: !!window.AudioContext,
            gamepadSupport: !!navigator.getGamepads,
            touchSupport: 'ontouchstart' in window
        })
        
        engine.gui('loading').hide()
        engine.gui('hud').show()
    },
    
    onDisconnect(engine: RpgClientEngine, reason: any, socket: any) {
        console.log('🔌 Disconnected:', reason)
        
        // Disable multiplayer features
        engine.chat.disable()
        engine.voiceChat.disconnect()
        
        // Show appropriate UI
        engine.gui('hud').hide()
        engine.gui('disconnected').show({ reason })
    },
    
    onConnectError(engine: RpgClientEngine, err: any, socket: any) {
        console.error('Connection failed:', err)
        
        engine.gui('connection-error').show({
            error: err.message,
            onRetry: () => engine.reconnect(),
            onOffline: () => engine.startOfflineMode()
        })
    },
    
    onWindowResize() {
        // Responsive design adjustments
        const width = window.innerWidth
        const height = window.innerHeight
        
        engine.renderer.resize(width, height)
        engine.ui.adjustLayout(width, height)
        
        // Mobile optimizations
        if (width < 768) {
            engine.ui.enableMobileMode()
        } else {
            engine.ui.disableMobileMode()
        }
    }
}

export default defineModule({
    engine
})
``` 