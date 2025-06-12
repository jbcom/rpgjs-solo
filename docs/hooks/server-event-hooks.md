# Server Event Hooks

Event hooks allow you to customize the behavior of events on the server side. These hooks are defined in the `event` property of your server module and apply to all events in your game.

## Usage

```ts
import { RpgEvent, RpgPlayer, RpgMap, RpgEventHooks, defineModule } from '@rpgjs/server'

const event: RpgEventHooks = {
    onInit(event: RpgEvent) {
        console.log(`Event ${event.id} initialized`)
    },
    onAction(event: RpgEvent, player: RpgPlayer) {
        console.log(`Player ${player.name} interacted with ${event.id}`)
    }
}

export default defineModule({
    event
})
```

## Available Hooks

### onInit

**Description:** Called when an event is initialized on the map

**Parameters:**
- `event: RpgEvent` - The event instance

**Example:**
```ts
const event: RpgEventHooks = {
    onInit(event: RpgEvent) {
        console.log(`🎯 Event ${event.id} initialized`)
    }
}
```

### onAction

**Description:** Called when a player interacts with an event (typically by pressing the action key)

**Parameters:**
- `event: RpgEvent` - The event instance
- `player: RpgPlayer` - The player who interacted with the event

**Example:**
```ts
const event: RpgEventHooks = {
    async onAction(event: RpgEvent, player: RpgPlayer) {
        console.log(`${player.name} interacted with ${event.name}`)

        switch (event.name) {
            case 'treasure-chest':
                if (!event.getVariable('isOpened')) {
                    event.setVariable('isOpened', true)
                    player.addItem('gold', 100)
                    player.showText('You found 100 gold!')
                    event.setGraphic('opened-chest')
                } else {
                    player.showText('The chest is empty.')
                }
                break
                
            case 'save-point':
                player.save()
                await player.showText('Game saved!')
                event.showAnimation('save-effect')
                break
                
            case 'teleporter':
                player.changeMap('other_map', {
                    x: event.x,
                    y: event.y
                })
                break
        }
    }
}
```

### onBeforeCreated

**Description:** Called before an event is created, allowing you to modify the event object or return a custom event configuration

**Parameters:**
- `object: any` - The raw event data from the map
- `map: RpgMap` - The map instance where the event will be created

**Returns:**
- `any` - Modified event configuration

**Example:**
```ts
const event: RpgEventHooks = {
    onBeforeCreated(object: any, map: RpgMap) {
        console.log(`Creating event ${object.name} on map ${map.id}`)
    }
}
```

### onPlayerTouch

**Description:** Called when a player touches an event (collision detection)

**Parameters:**
- `event: RpgEvent` - The event instance
- `player: RpgPlayer` - The player who touched the event

**Example:**
```ts
const event: RpgEventHooks = {
    onPlayerTouch(event: RpgEvent, player: RpgPlayer) {
        console.log(`${player.name} touched ${event.name}`)
    }
}
```

### onDetectInShape / onDetectOutShape

**Description:** Called when a player enters or leaves an event's detection shape

**Parameters:**
- `event: RpgEvent` - The event instance
- `player: RpgPlayer` - The player who entered/left the shape
- `shape: RpgShape` - The shape instance

**Example:**
```ts
const event: RpgEventHooks = {
    onDetectInShape(event: RpgEvent, player: RpgPlayer, shape: RpgShape) {

    },
    
    onDetectOutShape(event: RpgEvent, player: RpgPlayer, shape: RpgShape) {
        
    }
}
```

### onInShape / onOutShape

**Description:** Called when the event itself enters or leaves a shape

**Parameters:**
- `event: RpgEvent` - The event instance
- `shape: RpgShape` - The shape instance

**Example:**
```ts
const event: RpgEventHooks = {
    onInShape(event: RpgEvent, shape: RpgShape) {
        
    },
    
    onOutShape(event: RpgEvent, shape: RpgShape) {
        
    }
}
```

### onChanges

**Description:** Called when an event's properties change

**Parameters:**
- `event: RpgEvent` - The event instance
- `player: RpgPlayer` - The player who caused the change (if applicable)

**Example:**
```ts
const event: RpgEventHooks = {
    onChanges(event: RpgEvent, player: RpgPlayer) {
        
    }
}
```
