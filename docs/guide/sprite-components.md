---
title: "Sprite Components Guide"
description: "Guide for Sprite Components Guide in RPGJS."
---

# Sprite Components Guide

This guide explains how to use sprite components to add visual elements behind or in front of sprites in RPGJS.

## Overview

RPGJS allows you to attach custom components to sprites that render either behind or in front of the main sprite graphics. This is useful for adding visual effects like shadows, health bars, status indicators, auras, or other UI elements that should be positioned relative to sprites.

## Component Properties

### `componentsBehind`
Components in this array render **behind** the sprite with a lower z-index. Perfect for:
- Shadow effects
- Aura or glow effects
- Ground-based visual elements
- Background decorations

### `componentsInFront` 
Components in this array render **in front** of the sprite with a higher z-index. Perfect for:
- Health bars
- Status effect indicators
- Damage numbers
- Name tags
- UI overlays

## Creating Sprite Components

Sprite components are Canvas Engine components (`.ce` files) that receive the sprite object as a prop.

### Basic Component Structure

```javascript
<!-- shadow.ce -->
<Ellipse 
  x={shadow.x} 
  y={shadow.y} 
  width={shadow.width} 
  height={shadow.height} 
  color="black" 
  blur={10} 
  alpha={0.5}
/>

<script>
  import { computed } from "canvasengine";
  
  const { object } = defineProps();
  
  const hitbox = object.hitbox;
  const shadow = computed(() => ({
    x: hitbox().w / 2,
    y: hitbox().h - (hitbox().h / 2),
    width: hitbox().w + 10,
    height: hitbox().h,
  }));
</script>
```

### Health Bar Component Example

```javascript
<!-- healthbar.ce -->
<Container x={healthBarX} y={healthBarY}>
  <Rect
    width={healthBarWidth} 
    height={healthBarHeight} 
    color="red" 
  />
  <Rect 
    width={healthBarWidth} 
    height={healthBarHeight} 
    color="green" 
  />
</Container>

<script>
  import { computed } from "canvasengine";
  
  const { object } = defineProps();
  const hp = object.hp;
  const maxHp = object.param.maxHp;
  const hitbox = object.hitbox;
  const healthBarX = computed(() => hitbox().w / 2 - 25);
  const healthBarY = -10
  const healthBarWidth = computed(() => {
    return (hp() / maxHp()) * 50;
  });
  const healthBarHeight = 6;
</script>
```

## Configuration Methods

### Method 1: Module Configuration

Configure components globally for all sprites in your module:

```typescript
// client.ts
import { RpgClient, defineModule } from '@rpgjs/client';
import ShadowComponent from './components/shadow.ce';
import HealthBarComponent from './components/healthbar.ce';

export default defineModule<RpgClient>({
  sprite: {
    componentsBehind: [ShadowComponent],
    componentsInFront: [HealthBarComponent]
  }
})
```

### Method 2: Engine Methods

Add components dynamically using the engine:

```typescript
// During game initialization
import { RpgClientEngine, inject } from '@rpgjs/client';

const engine = inject(RpgClientEngine);

// Add components behind sprites
engine.addSpriteComponentBehind(ShadowComponent);

// Add components in front of sprites  
engine.addSpriteComponentInFront(HealthBarComponent);
```

## Advanced Component Configuration

Sprite components support advanced configuration options that allow you to:
- Pass static or dynamic props to components
- Control when components are displayed using dependencies
- Wait for data to be ready before rendering

### Component Configuration Object

Instead of passing a component directly, you can use a configuration object with three optional properties:

```typescript
{
  component: ComponentClass,      // Required: The component to render
  props: Object | Function,       // Optional: Props to pass to the component
  dependencies: Function          // Optional: Dependencies that must be resolved
}
```

### Props Configuration

The `props` property can be either a static object or a function that receives the sprite object and returns props dynamically.

#### Static Props

Pass a static object that will be used for all sprites:

```typescript
import { RpgClient, defineModule } from '@rpgjs/client';
import LightHalo from './components/light-halo.ce';

export default defineModule<RpgClient>({
  sprite: {
    componentsInFront: [{
      component: LightHalo,
      props: {
        radius: 25,
        color: 0xffffaa
      }
    }]
  }
})
```

#### Dynamic Props (Function)

Use a function to compute props based on the sprite's state. The function receives the sprite object as a parameter:

```typescript
import { RpgClient, defineModule } from '@rpgjs/client';
import { RpgClientObject } from '@rpgjs/client';
import LightHalo from './components/light-halo.ce';

export default defineModule<RpgClient>({
  sprite: {
    componentsInFront: [{
      component: LightHalo,
      props: (object: RpgClientObject) => {
        // Access sprite properties reactively
        const level = object.param.level();
        const baseRadius = 25;
        
        // Increase radius based on level
        return {
          radius: baseRadius + (level * 2),
          color: level > 10 ? 0xffaa00 : 0xffffaa
        };
      }
    }]
  }
})
```

**Key Points:**
- The function is called for each sprite instance
- You can access sprite signals reactively (e.g., `object.hp()`, `object.param.level()`)
- Props are recalculated when sprite state changes
- The returned object is passed directly to the component as props

### Dependencies Configuration

The `dependencies` property allows you to control when a component should be displayed. This is useful for waiting until certain data is available before rendering the component.

#### How Dependencies Work

- The `dependencies` function receives the sprite object and returns an array of signals or values
- The component **only renders** when **all** dependencies are resolved (not `undefined`)
- This prevents components from displaying with incomplete or missing data
- Dependencies are checked reactively, so the component will appear/disappear as values change

#### Basic Dependencies Example

Wait for specific sprite properties to be available:

```typescript
import { RpgClient, defineModule } from '@rpgjs/client';
import { RpgClientObject } from '@rpgjs/client';
import { signal } from 'canvasengine';
import HealthBar from './components/healthbar.ce';

export default defineModule<RpgClient>({
  sprite: {
    componentsInFront: [{
      component: HealthBar,
      props: (object: RpgClientObject) => ({
        hp: object.hp(),
        maxHp: object.param.maxHp()
      }),
      dependencies: (object: RpgClientObject) => {
        // Component only displays when both hp and maxHp are defined
        return [object.hp, object.param.maxHp];
      }
    }]
  }
})
```

#### Custom Dependencies with Signals

You can create custom signals to control component visibility:

```typescript
import { RpgClient, defineModule } from '@rpgjs/client';
import { RpgClientObject } from '@rpgjs/client';
import { signal } from 'canvasengine';
import LightHalo from './components/light-halo.ce';

export default defineModule<RpgClient>({
  sprite: {
    componentsInFront: [{
      component: LightHalo,
      props: (object: RpgClientObject) => ({
        radius: 25
      }),
      dependencies: (object: RpgClientObject) => {
        // Create a custom signal that starts as undefined
        const isReady = signal(undefined);
        
        // Simulate async data loading
        setTimeout(() => {
          isReady.set(true);
        }, 1000);
        
        // Component won't display until isReady is set
        return [isReady];
      }
    }]
  }
})
```

#### Multiple Dependencies

You can wait for multiple conditions:

```typescript
dependencies: (object: RpgClientObject) => {
  const customSignal = signal(undefined);
  const anotherValue = someAsyncOperation();
  
  // Component displays only when ALL are defined:
  // - object.hp is defined
  // - object.param.maxHp is defined
  // - customSignal is defined
  // - anotherValue is defined
  return [
    object.hp,
    object.param.maxHp,
    customSignal,
    anotherValue
  ];
}
```

## Prebuilt Components

RPGJS includes prebuilt sprite components that you can use directly in your game without creating them from scratch. These components are ready to use and highly customizable.

### Available Prebuilt Components

- **[Light Halo](/guide/prebuilt-components/light-halo)** - An animated light effect that pulses and glows around sprites, perfect for atmospheric lighting, magical auras, or ambient glow effects.

More prebuilt components will be added in future versions. Check the [Prebuilt Components](/guide/prebuilt-components/) section for the latest additions.