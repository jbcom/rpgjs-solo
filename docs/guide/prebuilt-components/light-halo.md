---
title: "Light Halo Component"
description: "Guide for Light Halo Component in RPGJS."
---

# Light Halo Component

The Light Halo component creates a beautiful animated light effect that pulses and moves around sprites. It's perfect for adding atmospheric lighting effects, magical auras, or ambient glow to characters and objects in your game.

## Overview

The Light Halo component uses a radial gradient with blur effects to simulate realistic light diffusion. It features:
- **Organic pulsing animation** - Uses multiple sine waves for natural breathing effects
- **Opacity variations** - Smooth fade in/out with subtle flicker (candle-like effect)
- **Customizable appearance** - Configurable size, color, opacity, and animation speeds
- **Reactive props** - Supports both static and dynamic configuration based on sprite state

## Basic Usage

### Import the Component

First, import the LightHalo component from the prebuilt components:

```typescript
import { RpgClient, defineModule } from '@rpgjs/client';
import LightHalo from '@rpgjs/client';
```

### Simple Configuration with Defaults

Use the component with default settings (warm yellow-white light):

```typescript
export default defineModule<RpgClient>({
  sprite: {
    componentsBehind: [LightHalo]
  }
})
```

This will create a light halo behind all sprites with:
- Base radius: 30 pixels
- Warm yellow-white color (0xffffaa)
- Smooth pulsing and fading animations

## Configuration Options

All props are optional and have sensible defaults. You can customize any aspect of the light halo:

### Available Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `baseRadius` | `number` | `30` | Base radius of the light halo in pixels |
| `radiusVariation` | `number` | `10` | Pulse variation range (halo pulses between `baseRadius ± radiusVariation`) |
| `baseOpacity` | `number` | `0.6` | Base opacity of the light halo (0 to 1) |
| `opacityVariation` | `number` | `0.3` | Opacity fade range (halo fades between `baseOpacity ± opacityVariation`) |
| `sizeSpeed` | `number` | `0.002` | Animation speed for size pulsing (higher = faster) |
| `opacitySpeed` | `number` | `0.003` | Animation speed for opacity fading (higher = faster) |
| `lightColor` | `number` | `0xffffaa` | Color of the light halo (hex value, warm yellow-white by default) |

### Static Props Configuration

Configure the component with static values for all sprites:

```typescript
import { RpgClient, defineModule } from '@rpgjs/client';
import LightHalo from '@rpgjs/client/src/components/prebuilt/light-halo.ce';

export default defineModule<RpgClient>({
  sprite: {
    componentsBehind: [{
      component: LightHalo,
      props: {
        baseRadius: 50,
        radiusVariation: 15,
        baseOpacity: 0.8,
        opacityVariation: 0.2,
        lightColor: 0xffaaaa,  // Reddish light
        sizeSpeed: 0.003,
        opacitySpeed: 0.004
      }
    }]
  }
})
```

### Dynamic Props Configuration

Use a function to compute props based on sprite state. The function receives the sprite object as a parameter and can access reactive properties:

```typescript
import { RpgClient, defineModule } from '@rpgjs/client';
import { RpgClientObject } from '@rpgjs/client';
import LightHalo from '@rpgjs/client/src/components/prebuilt/light-halo.ce';

export default defineModule<RpgClient>({
  sprite: {
    componentsBehind: [{
      component: LightHalo,
      props: (object: RpgClientObject) => {
        const level = object.param.level();
        
        // Increase radius and change color based on level
        return {
          baseRadius: 30 + (level * 2),
          radiusVariation: 10 + (level * 0.5),
          lightColor: level > 10 ? 0xffaa00 : 0xffffaa,  // Orange for high level, yellow for low
          baseOpacity: 0.6 + (level * 0.01)
        };
      }
    }]
  }
})
```

### Color Examples

Here are some common color values you can use:

```typescript
// Warm candlelight
lightColor: 0xffffaa

// Cool blue light (magical)
lightColor: 0xaaaaff

// Reddish fire glow
lightColor: 0xffaaaa

// Green toxic glow
lightColor: 0xaaffaa

// Purple mystical aura
lightColor: 0xffaaff

// White pure light
lightColor: 0xffffff

// Orange intense flame
lightColor: 0xffaa00
```

## Examples

### Example 1: Subtle Ambient Light

A gentle, barely visible light for atmospheric effect:

```typescript
export default defineModule<RpgClient>({
  sprite: {
    componentsBehind: [{
      component: LightHalo,
      props: {
        baseRadius: 20,
        radiusVariation: 5,
        baseOpacity: 0.3,
        opacityVariation: 0.1,
        sizeSpeed: 0.001,
        opacitySpeed: 0.002
      }
    }]
  }
})
```

### Example 2: Intense Magical Aura

A vibrant, pulsing magical aura:

```typescript
export default defineModule<RpgClient>({
  sprite: {
    componentsBehind: [{
      component: LightHalo,
      props: {
        baseRadius: 60,
        radiusVariation: 20,
        baseOpacity: 0.8,
        opacityVariation: 0.4,
        lightColor: 0xaaaaff,  // Cool blue
        sizeSpeed: 0.004,
        opacitySpeed: 0.005
      }
    }]
  }
})
```

### Example 3: Level-Based Dynamic Light

Light intensity increases with character level:

```typescript
export default defineModule<RpgClient>({
  sprite: {
    componentsBehind: [{
      component: LightHalo,
      props: (object: RpgClientObject) => {
        const level = object.param.level();
        const maxLevel = 50;
        
        // Scale from 20px to 80px based on level
        const progress = level / maxLevel;
        const baseRadius = 20 + (progress * 60);
        
        // Change color as level increases
        let lightColor;
        if (level < 10) lightColor = 0xffffaa;      // Yellow
        else if (level < 25) lightColor = 0xffaa00; // Orange
        else if (level < 40) lightColor = 0xffaaaa; // Red
        else lightColor = 0xffaaff;                  // Purple
        
        return {
          baseRadius,
          radiusVariation: baseRadius * 0.3,
          baseOpacity: 0.5 + (progress * 0.3),
          lightColor
        };
      }
    }]
  }
})
```

### Example 4: Conditional Light Based on State

Only show light when sprite has a certain state:

```typescript
export default defineModule<RpgClient>({
  sprite: {
    componentsBehind: [{
      component: LightHalo,
      props: (object: RpgClientObject) => {
        // Only show light if sprite has "magical" state
        const hasMagic = object.states?.some(state => state.name === 'magical');
        
        if (!hasMagic) {
          return {
            baseRadius: 0,  // Hide by setting radius to 0
            baseOpacity: 0
          };
        }
        
        return {
          baseRadius: 40,
          lightColor: 0xaaaaff,
          baseOpacity: 0.7
        };
      }
    }]
  }
})
```

## Positioning

The Light Halo is automatically centered on the sprite by default. It uses the sprite's hitbox to calculate the center position:

- **X Position**: `hitbox.w / 2` (center horizontally)
- **Y Position**: `hitbox.h / 2` (center vertically)

The component is rendered behind the sprite (using `componentsBehind`), so it appears as a background glow effect.

## Performance Considerations

- The component uses efficient blur filters that are created once and reused
- Animation calculations are optimized using computed signals
- The drawing function only renders when opacity and radius are greater than 0

For best performance when using multiple light halos:
- Use lower `radiusVariation` values for subtler effects
- Reduce `baseOpacity` if you don't need bright lights
- Consider using dynamic props to conditionally disable lights when not needed

## Technical Details

### Animation Algorithm

The component uses a sophisticated animation system:

- **Size Animation**: Combines two sine waves with different frequencies for organic, less predictable pulsing
- **Opacity Animation**: Main breathing cycle with a subtle high-frequency flicker for realistic candle-like effects
- **Blur Effect**: Uses PixiJS BlurFilter with additive blend mode for realistic light diffusion

### Reactive System

All props are reactive signals, meaning:
- Static props are automatically converted to signals
- Dynamic props (functions) can access reactive sprite properties
- Changes to props automatically update the visual effect in real-time

## See Also

- [Sprite Components Guide](/guide/sprite-components.md) - General guide on using sprite components
- [CanvasEngine Reactive Programming](https://canvasengine.net/concepts/reactive.md) - Understanding signals and reactivity
