# Engine Injection in .ce Files

This guide explains how to access the RPG-JS client engine and retrieve events and players data within Canvas Engine (`.ce`) component files.

## Injecting the Engine

To access the RPG-JS client engine in a `.ce` file, you need to use the dependency injection system:

```javascript
<script>
import { inject } from "../../core/inject";
import { RpgClientEngine } from "../../RpgClientEngine";

const engine = inject(RpgClientEngine);
</script>
```

## Accessing Events and Players

Once you have injected the engine, you can access the events and players through the scene map:

```javascript
<script>
import { inject } from "../../core/inject";
import { RpgClientEngine } from "../../RpgClientEngine";

const engine = inject(RpgClientEngine);
const players = engine.sceneMap.players;
const events = engine.sceneMap.events;
</script>
```

## Understanding Signals

Both `players` and `events` are **signals** - reactive data structures that automatically notify components when their data changes. This means:

- **Automatic Updates**: When a player moves or an event changes on the server, the signal automatically updates
- **Reactive Rendering**: Your component will re-render automatically when the data changes
- **Real-time Synchronization**: Changes from the server are synchronized in real-time through WebSocket connections

### Signal Properties

```javascript
// players and events are signals containing Record<string, Object>
const players = engine.sceneMap.players; // Signal<Record<string, RpgClientPlayer>>
const events = engine.sceneMap.events;   // Signal<Record<string, RpgClientEvent>>
```

## Complete Example

Here's a complete example showing how to use the engine injection to display events and players:

```javascript
<Container sortableChildren={true}>
    @for ((event, id) of events) {
        <Character id={id} object={event} isMe={false} />
    }

    @for ((player, id) of players) {
        <Character id={id} object={player} isMe={true} />
    }
</Container>

<script>
    import { inject } from "../../core/inject";
    import { RpgClientEngine } from "../../RpgClientEngine";
    import Character from "../character.ce";
   
    const engine = inject(RpgClientEngine);
    const players = engine.sceneMap.players;
    const events = engine.sceneMap.events;
</script>
```

## Additional Engine Properties

The engine provides access to many other useful properties:

```javascript
const engine = inject(RpgClientEngine);

// Scene and map data
const sceneData = engine.sceneMap.data;
const effects = engine.effects;

// Resources
const spritesheets = engine.spritesheets;
const sounds = engine.sounds;

// Configuration
const globalConfig = engine.globalConfig;

// Particle settings
const particleSettings = engine.particleSettings;
```

## Signal Synchronization

The signals are automatically synchronized with the server through the `@signe/sync` system:

- **Server Changes**: When the server updates player positions, event states, or other data
- **WebSocket Events**: Changes are sent via WebSocket `sync` events
- **Automatic Updates**: The `load()` function updates the signals with new data
- **Component Re-rendering**: Canvas Engine components automatically re-render when signals change

This creates a seamless real-time experience where your UI components stay synchronized with the game state without manual intervention.

## Best Practices

1. **Import Path**: Always use the correct relative path for imports based on your file location
2. **Signal Access**: Access signals directly - they will automatically update your component
3. **Performance**: Signals are optimized for performance and only trigger updates when data actually changes
4. **Type Safety**: Use TypeScript for better development experience with proper typing

## Common Use Cases

- **Player Lists**: Display all connected players
- **Event Interaction**: Show interactive events on the map  
- **Real-time Updates**: Automatically update UI when game state changes
- **Character Movement**: Track and display character positions
- **Game Effects**: Access and display visual effects 