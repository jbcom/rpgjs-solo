# Spritesheets Guide

This guide explains how to work with spritesheets in RPG-JS, including static spritesheets and dynamic spritesheet resolution.

## Overview

Spritesheets are image files containing multiple frames or tiles that are used to display characters, objects, and animations in your game. RPG-JS supports both pre-loaded static spritesheets and dynamic spritesheet creation through a resolver system.

## Static Spritesheets

### Basic Configuration

Add spritesheets to your client module configuration:

```typescript
import { defineModule, RpgClient, Presets } from '@rpgjs/client';

export default defineModule<RpgClient>({
  spritesheets: [
    {
      id: 'hero',
      image: 'hero.png',
      width: 192,
      height: 256,
      framesWidth: 3,
      framesHeight: 4,
      // ... animation configurations
    },
    Presets.LPCSpritesheetPreset({
      id: 'monster',
      imageSource: 'monster.png',
      width: 1728,
      height: 5568,
      ratio: 1.5,
    }),
  ],
});
```

### Using Presets

RPG-JS provides several preset helpers to simplify spritesheet configuration:

- **LPCSpritesheetPreset**: For Liberated Pixel Cup (LPC) style character spritesheets
- **FacesetPreset**: For character face expressions in dialog boxes
- **AnimationSpritesheetPreset**: For animation sequences

See the [Display Animations Guide](/guide/display-animations) for more details on animation spritesheets.

## Dynamic Spritesheet Resolver

The spritesheet resolver allows you to create spritesheets on-the-fly when they are requested but not found in the cache. This is useful for:

- Loading spritesheets from external APIs
- Generating spritesheets programmatically
- Creating spritesheets based on runtime data
- Lazy loading spritesheets to reduce initial load time

### Configuration

Add a `spritesheetResolver` function to your client module:

```typescript
import { defineModule, RpgClient } from '@rpgjs/client';

export default defineModule<RpgClient>({
  spritesheetResolver: (id: string) => {
    // Synchronous resolver
    if (id === 'dynamic-sprite') {
      return {
        id: 'dynamic-sprite',
        image: 'path/to/image.png',
        width: 192,
        height: 256,
        framesWidth: 3,
        framesHeight: 4,
        // ... other spritesheet properties
      };
    }
    return undefined; // Return undefined if spritesheet cannot be created
  },
});
```

### Asynchronous Resolver

The resolver can also be asynchronous, useful for loading spritesheets from APIs or files:

```typescript
export default defineModule<RpgClient>({
  spritesheetResolver: async (id: string) => {
    // Load from API
    try {
      const response = await fetch(`/api/spritesheets/${id}`);
      if (!response.ok) {
        return undefined;
      }
      const spritesheetData = await response.json();
      return spritesheetData;
    } catch (error) {
      console.error(`Failed to load spritesheet ${id}:`, error);
      return undefined;
    }
  },
});
```

### Programmatic Generation

You can also generate spritesheets programmatically:

```typescript
export default defineModule<RpgClient>({
  spritesheetResolver: (id: string) => {
    // Generate spritesheet based on ID pattern
    if (id.startsWith('generated-')) {
      const parts = id.split('-');
      const type = parts[1];
      const variant = parts[2];
      
      return {
        id: id,
        image: `generated/${type}/${variant}.png`,
        width: 64,
        height: 64,
        framesWidth: 1,
        framesHeight: 1,
        // Generate animations based on type
        textures: {
          default: {
            animations: () => generateAnimationsForType(type),
          },
        },
      };
    }
    return undefined;
  },
});
```

### How It Works

1. When a spritesheet is requested (e.g., when displaying a sprite), the engine first checks the cache
2. If the spritesheet is not found and a resolver is configured, the resolver is called with the spritesheet ID
3. The resolved spritesheet is automatically cached for future use
4. If the resolver returns `undefined` or `null`, the spritesheet is not found and will not be displayed

### Resolver Function Signature

```typescript
type SpritesheetResolver = (id: string) => SpritesheetDefinition | Promise<SpritesheetDefinition> | undefined | null;
```

**Parameters:**
- `id: string` - The spritesheet ID that was requested

**Returns:**
- `SpritesheetDefinition` - A spritesheet configuration object (synchronous)
- `Promise<SpritesheetDefinition>` - A Promise that resolves to a spritesheet (asynchronous)
- `undefined | null` - Indicates the spritesheet cannot be created

### Spritesheet Definition

A spritesheet definition is an object with the following properties:

```typescript
interface SpritesheetDefinition {
  id: string;                    // Unique identifier
  image: string;                  // Path to the image file
  width: number;                  // Width of the spritesheet image
  height: number;                 // Height of the spritesheet image
  framesWidth?: number;           // Number of frames horizontally
  framesHeight?: number;          // Number of frames vertically
  textures?: {                    // Animation configurations
    [key: string]: {
      animations: () => AnimationFrame[][];
    };
  };
  // ... other spritesheet-specific properties
}
```

### Programmatic API

You can also set a resolver programmatically using the engine:

```typescript
import { RpgClientEngine, inject } from '@rpgjs/client';

// In a hook or initialization code
const engine = inject(RpgClientEngine);

engine.setSpritesheetResolver((id: string) => {
  // Your resolver logic
  return spritesheetDefinition;
});
```

### Best Practices

1. **Cache Management**: Resolved spritesheets are automatically cached. If you need to invalidate the cache, you can clear it manually:
   ```typescript
   engine.spritesheets.delete('spritesheet-id');
   ```

2. **Error Handling**: Always handle errors gracefully in async resolvers:
   ```typescript
   spritesheetResolver: async (id: string) => {
     try {
       // Load spritesheet
       return spritesheet;
     } catch (error) {
       console.error(`Error loading spritesheet ${id}:`, error);
       return undefined;
     }
   }
   ```

3. **Performance**: Use resolvers for spritesheets that are not needed immediately. Pre-load critical spritesheets in the static `spritesheets` array.

4. **ID Patterns**: Use consistent ID patterns to make resolver logic easier:
   ```typescript
   spritesheetResolver: (id: string) => {
     // Pattern: type-variant-color
     // Example: character-warrior-red
     const [type, variant, color] = id.split('-');
     // ...
   }
   ```

### Example: Loading from CDN

```typescript
export default defineModule<RpgClient>({
  spritesheetResolver: async (id: string) => {
    const cdnUrl = `https://cdn.example.com/spritesheets/${id}.json`;
    
    try {
      const response = await fetch(cdnUrl);
      if (!response.ok) {
        return undefined;
      }
      
      const config = await response.json();
      
      // Ensure the image URL is also from CDN
      return {
        ...config,
        image: `https://cdn.example.com/images/${config.image}`,
      };
    } catch (error) {
      console.warn(`Spritesheet ${id} not found on CDN`);
      return undefined;
    }
  },
});
```

### Example: Fallback Chain

```typescript
export default defineModule<RpgClient>({
  spritesheetResolver: async (id: string) => {
    // Try local assets first
    try {
      const localResponse = await fetch(`/assets/spritesheets/${id}.json`);
      if (localResponse.ok) {
        return await localResponse.json();
      }
    } catch (error) {
      // Continue to fallback
    }
    
    // Fallback to CDN
    try {
      const cdnResponse = await fetch(`https://cdn.example.com/spritesheets/${id}.json`);
      if (cdnResponse.ok) {
        return await cdnResponse.json();
      }
    } catch (error) {
      // Continue to fallback
    }
    
    // Fallback to default
    if (id.startsWith('character-')) {
      return {
        id: id,
        image: '/assets/default-character.png',
        width: 192,
        height: 256,
        framesWidth: 3,
        framesHeight: 4,
      };
    }
    
    return undefined;
  },
});
```

## Combining Static and Dynamic

You can use both static spritesheets and a resolver together. Static spritesheets are loaded first, and the resolver is only called for spritesheets not found in the static list:

```typescript
export default defineModule<RpgClient>({
  // Pre-loaded spritesheets
  spritesheets: [
    { id: 'hero', image: 'hero.png', /* ... */ },
    { id: 'npc-1', image: 'npc1.png', /* ... */ },
  ],
  
  // Resolver for dynamic spritesheets
  spritesheetResolver: async (id: string) => {
    // Only called for spritesheets not in the static list above
    if (id.startsWith('dynamic-')) {
      return await loadDynamicSpritesheet(id);
    }
    return undefined;
  },
});
```

## See Also

- [Display Animations Guide](/guide/display-animations) - Learn about animation spritesheets
- [Sprite Components Guide](/guide/sprite-components) - Add visual components to sprites
- [Dialog Box Guide](/gui/dialog-box) - Using facesets in dialogs

