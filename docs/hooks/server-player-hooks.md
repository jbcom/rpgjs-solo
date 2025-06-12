# Server Player Hooks

Player hooks allow you to listen to player-specific events and customize player behavior on the server side. These hooks are defined in the `player` property of your server module.

## Usage

```ts
import { RpgPlayer, RpgMap, RpgPlayerHooks, defineModule } from '@rpgjs/server'

const player: RpgPlayerHooks = {
    onConnected(player: RpgPlayer) {
        console.log(`Player ${player.id} connected`)
        player.changeMap('spawn-map')
    },
    onJoinMap(player: RpgPlayer, map: RpgMap) {
        console.log(`Player ${player.id} joined map ${map.id}`)
    }
}

export default defineModule({
    player
})
```

## Custom Properties

You can define custom properties that will be synchronized with the client and optionally saved to the database:

```ts
// First, extend the RpgPlayer interface
declare module '@rpgjs/server' {
    export interface RpgPlayer {
        gold: number
        experience: number
        secretData: string
    }
}

const player: RpgPlayerHooks = {
    props: {
        gold: {
            $default: 100,
            $syncWithClient: true,
            $permanent: true
        },
        experience: {
            $default: 0,
            $syncWithClient: true,
            $permanent: true
        },
        secretData: {
            $default: '',
            $syncWithClient: false, // Not sent to client
            $permanent: false       // Not saved to database
        }
    }
}
```

## Available Hooks

### onConnected

**Description:** Called when a player connects to the server

**Parameters:**
- `player: RpgPlayer` - The player instance

**Example:**
```ts
const player: RpgPlayerHooks = {
    onConnected(player: RpgPlayer) {
        console.log(`Welcome ${player.name}!`)
        player.gold = 1000
        player.changeMap('tutorial-map')
        
        // Send welcome message
        player.showText('Welcome to the game!')
    }
}
```

### onJoinMap

**Description:** Called when a player joins a map

**Parameters:**
- `player: RpgPlayer` - The player instance
- `map: RpgMap` - The map instance the player joined

**Example:**
```ts
const player: RpgPlayerHooks = {
    onJoinMap(player: RpgPlayer, map: RpgMap) {
        console.log(`${player.name} entered ${map.name}`)
        
        // Set player position based on map spawn point
        if (map.spawnPoint) {
            player.teleport(map.spawnPoint.x, map.spawnPoint.y)
        }
        
        // Apply map-specific effects
        if (map.id === 'dark-forest') {
            player.addState('darkness')
        }
    }
}
```

### onLeaveMap

**Description:** Called when a player leaves a map

**Parameters:**
- `player: RpgPlayer` - The player instance
- `map: RpgMap` - The map instance the player left

**Example:**
```ts
const player: RpgPlayerHooks = {
    onLeaveMap(player: RpgPlayer, map: RpgMap) {
        console.log(`${player.name} left ${map.name}`)
        
        // Remove map-specific effects
        if (map.id === 'dark-forest') {
            player.removeState('darkness')
        }
        
        // Save player progress
        player.save()
    }
}
```

### onInput

**Description:** Called when a player presses a key on the client side

**Parameters:**
- `player: RpgPlayer` - The player instance
- `data: { input: string, moving: boolean }` - Input data

**Example:**
```ts
const player: RpgPlayerHooks = {
    onInput(player: RpgPlayer, { input, moving }) {
        if (input === 'action' && !moving) {
            // Player pressed action key while standing still
            const nearbyEvents = player.getEventsInRadius(32)
            if (nearbyEvents.length > 0) {
                nearbyEvents[0].execMethod('onAction', [player])
            }
        }
        
        if (input === 'escape') {
            // Open menu
            player.gui('main-menu').open()
        }
    }
}
```

### onLevelUp

**Description:** Called when a player increases one level

**Parameters:**
- `player: RpgPlayer` - The player instance
- `nbLevel: number` - Number of levels gained

**Example:**
```ts
const player: RpgPlayerHooks = {
    onLevelUp(player: RpgPlayer, nbLevel: number) {
        console.log(`${player.name} gained ${nbLevel} level(s)!`)
        
        // Restore health and mana
        player.hp = player.param.maxHp
        player.sp = player.param.maxSp
        
        // Show level up effect
        player.showAnimation('level-up-effect')
        player.showText(`Level Up! You are now level ${player.level}`)
        
        // Grant skill points
        player.skillPoints += nbLevel * 2
    }
}
```

### onDead

**Description:** Called when a player's HP drops to 0

**Parameters:**
- `player: RpgPlayer` - The player instance

**Example:**
```ts
const player: RpgPlayerHooks = {
    onDead(player: RpgPlayer) {
        console.log(`${player.name} has died`)
        
        // Apply death penalty
        player.gold = Math.floor(player.gold * 0.9) // Lose 10% gold
        player.experience = Math.floor(player.experience * 0.95) // Lose 5% exp
        
        // Respawn player
        setTimeout(() => {
            player.hp = Math.floor(player.param.maxHp * 0.5) // Respawn with 50% HP
            player.changeMap('respawn-point')
            player.showText('You have been revived!')
        }, 3000)
    }
}
```

### onDisconnected

**Description:** Called when a player leaves the server

**Parameters:**
- `player: RpgPlayer` - The player instance

**Example:**
```ts
const player: RpgPlayerHooks = {
    onDisconnected(player: RpgPlayer) {
        console.log(`${player.name} disconnected`)
        
        // Save player data
        player.save()
        
        // Notify other players
        const map = player.getCurrentMap()
        if (map) {
            map.broadcastToPlayers('showText', [`${player.name} has left the game`])
        }
    }
}
```

### onMove

**Description:** Called when the player's x, y positions change

**Parameters:**
- `player: RpgPlayer` - The player instance

**Example:**
```ts
const player: RpgPlayerHooks = {
    onMove(player: RpgPlayer) {
        // Check for hidden treasures
        const treasures = player.getCurrentMap().getEventsOfType('treasure')
        treasures.forEach(treasure => {
            if (treasure.isHidden && player.distanceTo(treasure) < 16) {
                treasure.reveal()
                player.showText('You found a hidden treasure!')
            }
        })
        
        // Update step counter
        player.stepCount = (player.stepCount || 0) + 1
        
        // Random encounters
        if (player.stepCount % 100 === 0) {
            if (Math.random() < 0.1) { // 10% chance
                player.callBattle('random-encounter')
            }
        }
    }
}
```

### onInShape / onOutShape

**Description:** Called when a player enters or leaves a shape

**Parameters:**
- `player: RpgPlayer` - The player instance
- `shape: RpgShape` - The shape instance

**Example:**
```ts
const player: RpgPlayerHooks = {
    onInShape(player: RpgPlayer, shape: RpgShape) {
        if (shape.name === 'healing-zone') {
            player.addState('regeneration')
            player.showText('You feel rejuvenated...')
        }
        
        if (shape.name === 'danger-zone') {
            player.showText('⚠️ Danger Zone - Proceed with caution!')
        }
    },
    
    onOutShape(player: RpgPlayer, shape: RpgShape) {
        if (shape.name === 'healing-zone') {
            player.removeState('regeneration')
            player.showText('The healing effect fades away.')
        }
    }
}
```

### canChangeMap

**Description:** Determines if a player can change to a specific map

**Parameters:**
- `player: RpgPlayer` - The player instance
- `nextMap: RpgClassMap<RpgMap>` - The map class the player wants to enter

**Returns:**
- `boolean | Promise<boolean>` - Whether the player can change maps

**Example:**
```ts
const player: RpgPlayerHooks = {
    async canChangeMap(player: RpgPlayer, nextMap: any) {
        // Check if player has required level
        if (nextMap.requiredLevel && player.level < nextMap.requiredLevel) {
            player.showText(`You need level ${nextMap.requiredLevel} to enter this area.`)
            return false
        }
        
        // Check if player has required item
        if (nextMap.requiredItem && !player.hasItem(nextMap.requiredItem)) {
            player.showText(`You need ${nextMap.requiredItem} to enter this area.`)
            return false
        }
        
        // Check with external service
        const hasPermission = await checkMapPermission(player.id, nextMap.id)
        if (!hasPermission) {
            player.showText('Access denied.')
            return false
        }
        
        return true
    }
}
```

## Complete Example

```ts
import { RpgPlayer, RpgMap, RpgPlayerHooks, defineModule } from '@rpgjs/server'

// Extend player interface
declare module '@rpgjs/server' {
    export interface RpgPlayer {
        gold: number
        experience: number
        stepCount: number
        lastSaveTime: number
    }
}

const player: RpgPlayerHooks = {
    props: {
        gold: { $default: 100 },
        experience: { $default: 0 },
        stepCount: { $default: 0 },
        lastSaveTime: { $default: 0 }
    },
    
    onConnected(player: RpgPlayer) {
        console.log(`🎮 ${player.name} joined the game`)
        player.changeMap('town-square')
        player.showText(`Welcome back, ${player.name}!`)
    },
    
    onJoinMap(player: RpgPlayer, map: RpgMap) {
        console.log(`📍 ${player.name} entered ${map.name}`)
        
        // Auto-save when entering important maps
        if (map.isImportant) {
            player.save()
            player.lastSaveTime = Date.now()
        }
    },
    
    onInput(player: RpgPlayer, { input }) {
        if (input === 'menu') {
            player.gui('inventory').open()
        }
    },
    
    onLevelUp(player: RpgPlayer, nbLevel: number) {
        player.hp = player.param.maxHp
        player.sp = player.param.maxSp
        player.showAnimation('level-up')
        player.showText(`🎉 Level Up! You are now level ${player.level}`)
    },
    
    onMove(player: RpgPlayer) {
        player.stepCount++
        
        // Auto-save every 5 minutes
        const now = Date.now()
        if (now - player.lastSaveTime > 300000) { // 5 minutes
            player.save()
            player.lastSaveTime = now
        }
    },
    
    onDisconnected(player: RpgPlayer) {
        console.log(`👋 ${player.name} left the game`)
        player.save()
    }
}

export default defineModule({
    player
})
``` 