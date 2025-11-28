# Sounds Guide

This guide explains how to work with sounds in RPG-JS, including static sound configuration, playing sounds from the server, and dynamic sound resolution.

## Overview

Sounds are audio files that can be played during gameplay to provide audio feedback for actions, events, and ambient effects. RPG-JS supports both pre-loaded static sounds and dynamic sound creation through a resolver system.

## Static Sounds

### Basic Configuration

Add sounds to your client module configuration:

```typescript
import { defineModule, RpgClient } from '@rpgjs/client';

export default defineModule<RpgClient>({
  sounds: [
    {
      id: "typewriter",
      src: "typewriter.wav",
    },
    {
      id: "cursor",
      src: "cursor.wav",
    },
    {
      id: "item-pickup",
      src: "sounds/item-pickup.mp3",
    },
  ],
});
```

### Sound Object Structure

A sound object can have the following properties:

```typescript
interface SoundDefinition {
  id: string;           // Unique identifier for the sound
  src: string;          // Path to the audio file
  // Optional: If the sound object has a play() method, it will be used directly
  play?: () => void;    // Custom play method (optional)
  stop?: () => void;    // Custom stop method (optional)
  pause?: () => void;   // Custom pause method (optional)
}
```

If a sound object has a `play()` method, it will be used directly. Otherwise, the engine will create an `Audio` element from the `src` property.

## Playing Sounds from Server

### Using `player.playSound()`

You can play sounds from the server side using the `playSound()` method on a player instance:

```typescript
/**
 * Play a sound on the client side
 * @param soundId - Sound identifier, defined on the client side
 * @param forEveryone - Indicate if the sound is heard by all players on the map (default: true)
 */
player.playSound(soundId: string, forEveryone: boolean = true): void
```

### Examples

#### Play Sound for All Players

```typescript
// Play an explosion sound for everyone on the map
player.playSound("explosion");

// Play a battle start sound for all players
player.playSound("battle-start", true);
```

#### Play Sound for Current Player Only

```typescript
// Play item pickup sound only for this player
player.playSound("item-pickup", false);

// Play a notification sound only for this player
player.playSound("notification", false);
```

### Use Cases

**For Everyone (`forEveryone = true`):**
- Environmental sounds (explosions, doors opening)
- Battle sounds (combat start, victory fanfare)
- Map-wide events (boss spawn, treasure chest opening)
- Ambient effects that should be synchronized

**For Current Player Only (`forEveryone = false`):**
- UI feedback sounds (menu navigation, button clicks)
- Personal notifications (level up, achievement unlocked)
- Item pickup sounds (only the player who picked it up hears it)
- Private messages or alerts

### Complete Example

```typescript
import { RpgPlayer, RpgPlayerHooks } from '@rpgjs/server';

const player: RpgPlayerHooks = {
  async onJoin(player: RpgPlayer) {
    // Play welcome sound for this player only
    player.playSound("welcome", false);
  },

  async onLevelUp(player: RpgPlayer) {
    // Play level up sound for this player only
    player.playSound("level-up", false);
    
    // Show level up animation
    player.showComponentAnimation("level-up", {
      text: `Level ${player.level}`,
      color: "gold"
    });
  },

  async onTouchEvent(player: RpgPlayer, event: RpgEvent) {
    if (event.name === "Treasure Chest") {
      // Play chest opening sound for everyone on the map
      player.playSound("chest-open", true);
      
      // Play item pickup sound only for this player
      player.playSound("item-pickup", false);
    }
  },

  async onBattleStart(player: RpgPlayer) {
    // Play battle music for everyone
    player.playSound("battle-theme", true);
  }
};
```

## Dynamic Sound Resolver

The sound resolver allows you to create sounds on-the-fly when they are requested but not found in the cache. This is useful for:

- Loading sounds from external APIs
- Generating sounds programmatically
- Creating sounds based on runtime data
- Lazy loading sounds to reduce initial load time

### Configuration

Add a `soundResolver` function to your client module:

```typescript
import { defineModule, RpgClient } from '@rpgjs/client';

export default defineModule<RpgClient>({
  soundResolver: (id: string) => {
    // Synchronous resolver
    if (id === 'dynamic-sound') {
      return {
        id: 'dynamic-sound',
        src: 'path/to/sound.mp3'
      };
    }
    return undefined; // Return undefined if sound cannot be created
  },
});
```

### Asynchronous Resolver

The resolver can also be asynchronous, useful for loading sounds from APIs or files:

```typescript
export default defineModule<RpgClient>({
  soundResolver: async (id: string) => {
    // Load from API
    try {
      const response = await fetch(`/api/sounds/${id}`);
      if (!response.ok) {
        return undefined;
      }
      const soundData = await response.json();
      return {
        id: id,
        src: soundData.url,
      };
    } catch (error) {
      console.error(`Failed to load sound ${id}:`, error);
      return undefined;
    }
  },
});
```

### Programmatic Generation

You can also generate sounds programmatically:

```typescript
export default defineModule<RpgClient>({
  soundResolver: (id: string) => {
    // Generate sound path based on ID pattern
    if (id.startsWith('footstep-')) {
      const surface = id.split('-')[1]; // e.g., 'footstep-grass'
      return {
        id: id,
        src: `sounds/footsteps/${surface}.mp3`,
      };
    }
    
    // Generate sound for weapon types
    if (id.startsWith('weapon-')) {
      const weaponType = id.split('-')[1];
      return {
        id: id,
        src: `sounds/weapons/${weaponType}/swing.mp3`,
      };
    }
    
    return undefined;
  },
});
```

### How It Works

1. When a sound is requested (e.g., via `player.playSound()`), the engine first checks the cache
2. If the sound is not found and a resolver is configured, the resolver is called with the sound ID
3. The resolved sound is automatically cached for future use
4. If the resolver returns `undefined` or `null`, the sound is not found and a warning is logged

### Resolver Function Signature

```typescript
type SoundResolver = (id: string) => SoundDefinition | Promise<SoundDefinition> | undefined | null;
```

**Parameters:**
- `id: string` - The sound ID that was requested

**Returns:**
- `SoundDefinition` - A sound configuration object (synchronous)
- `Promise<SoundDefinition>` - A Promise that resolves to a sound (asynchronous)
- `undefined | null` - Indicates the sound cannot be created

### Programmatic API

You can also set a resolver programmatically using the engine:

```typescript
import { RpgClientEngine, inject } from '@rpgjs/client';

// In a hook or initialization code
const engine = inject(RpgClientEngine);

engine.setSoundResolver((id: string) => {
  // Your resolver logic
  return soundDefinition;
});
```

### Example: Loading from CDN

```typescript
export default defineModule<RpgClient>({
  soundResolver: async (id: string) => {
    const cdnUrl = `https://cdn.example.com/sounds/${id}.mp3`;
    
    try {
      // Verify the sound exists
      const response = await fetch(cdnUrl, { method: 'HEAD' });
      if (!response.ok) {
        return undefined;
      }
      
      return {
        id: id,
        src: cdnUrl,
      };
    } catch (error) {
      console.warn(`Sound ${id} not found on CDN`);
      return undefined;
    }
  },
});
```

### Example: Fallback Chain

```typescript
export default defineModule<RpgClient>({
  soundResolver: async (id: string) => {
    // Try local assets first
    try {
      const localPath = `/assets/sounds/${id}.mp3`;
      const response = await fetch(localPath, { method: 'HEAD' });
      if (response.ok) {
        return {
          id: id,
          src: localPath,
        };
      }
    } catch (error) {
      // Continue to fallback
    }
    
    // Fallback to CDN
    try {
      const cdnUrl = `https://cdn.example.com/sounds/${id}.mp3`;
      const response = await fetch(cdnUrl, { method: 'HEAD' });
      if (response.ok) {
        return {
          id: id,
          src: cdnUrl,
        };
      }
    } catch (error) {
      // Continue to fallback
    }
    
    // Fallback to default sound
    if (id.startsWith('footstep-')) {
      return {
        id: id,
        src: '/assets/sounds/default-footstep.mp3',
      };
    }
    
    return undefined;
  },
});
```

## Combining Static and Dynamic

You can use both static sounds and a resolver together. Static sounds are loaded first, and the resolver is only called for sounds not found in the static list:

```typescript
export default defineModule<RpgClient>({
  // Pre-loaded sounds
  sounds: [
    { id: 'menu-click', src: 'sounds/menu-click.mp3' },
    { id: 'notification', src: 'sounds/notification.mp3' },
  ],
  
  // Resolver for dynamic sounds
  soundResolver: async (id: string) => {
    // Only called for sounds not in the static list above
    if (id.startsWith('dynamic-')) {
      return await loadDynamicSound(id);
    }
    return undefined;
  },
});
```

## Client-Side Sound API

You can also play sounds directly from the client side using the engine:

```typescript
import { RpgClientEngine, inject } from '@rpgjs/client';

// In a client hook or component
const engine = inject(RpgClientEngine);

// Play a sound
await engine.playSound('item-pickup');

// Get a sound (with resolver support)
const sound = await engine.getSound('dynamic-sound');
if (sound && sound.play) {
  sound.play();
}
```

## Best Practices

### 1. Sound File Formats

- Use compressed formats (MP3, OGG) for better performance
- Provide multiple formats for browser compatibility:
  ```typescript
  {
    id: 'background-music',
    src: 'music.ogg', // Fallback to MP3 if OGG not supported
  }
  ```

### 2. Error Handling

Always handle errors gracefully in async resolvers:

```typescript
soundResolver: async (id: string) => {
  try {
    // Load sound
    return sound;
  } catch (error) {
    console.error(`Error loading sound ${id}:`, error);
    return undefined;
  }
}
```

### 3. Performance

- Use static sounds for frequently played sounds (UI feedback, common actions)
- Use resolvers for sounds that are rarely used or loaded on-demand
- Pre-load critical sounds in the static `sounds` array

### 4. ID Patterns

Use consistent ID patterns to make resolver logic easier:

```typescript
soundResolver: (id: string) => {
  // Pattern: category-type-variant
  // Example: weapon-sword-swing, weapon-axe-swing
  const [category, type, variant] = id.split('-');
  
  if (category === 'weapon') {
    return {
      id: id,
      src: `sounds/${category}/${type}/${variant}.mp3`,
    };
  }
  
  return undefined;
}
```

### 5. Volume Management

Consider implementing volume controls:

```typescript
// In your sound resolver or sound object
{
  id: 'background-music',
  src: 'music.mp3',
  volume: 0.5, // 50% volume
}
```

### 6. Memory Management

Resolved sounds are automatically cached. If you need to invalidate the cache:

```typescript
engine.sounds.delete('sound-id');
```

## Common Use Cases

### Dialog Box Sounds

```typescript
// In your client module
sounds: [
  {
    id: "typewriter",
    src: "typewriter.wav",
  },
  {
    id: "cursor",
    src: "cursor.wav",
  },
],

// In your global config
box: {
  sounds: {
    typewriter: "typewriter",
    cursorMove: "cursor",
    cursorSelect: "cursor",
  }
}
```

### Footstep Sounds

```typescript
// Server-side: Play footstep sound based on terrain
const player: RpgPlayerHooks = {
  async onMove(player: RpgPlayer) {
    const terrain = player.getCurrentMap().getTerrainAt(player.x(), player.y());
    player.playSound(`footstep-${terrain}`, false); // Only for this player
  }
};

// Client-side: Resolver for footstep sounds
soundResolver: (id: string) => {
  if (id.startsWith('footstep-')) {
    const surface = id.split('-')[1];
    return {
      id: id,
      src: `sounds/footsteps/${surface}.mp3`,
    };
  }
  return undefined;
}
```

### Weapon Sounds

```typescript
// Server-side: Play weapon sound when attacking
const player: RpgPlayerHooks = {
  async onAttack(player: RpgPlayer, target: RpgPlayer) {
    const weapon = player.getEquippedWeapon();
    if (weapon) {
      player.playSound(`weapon-${weapon.type}-swing`, true); // Everyone hears it
      player.playSound(`weapon-${weapon.type}-hit`, true);   // Everyone hears it
    }
  }
};
```

## See Also

- [Spritesheets Guide](/guide/spritesheets) - Learn about dynamic spritesheet resolution (similar pattern)
- [Display Animations Guide](/guide/display-animations) - Combine sounds with visual effects
- [Dialog Box Guide](/gui/dialog-box) - Using sounds in dialog boxes

