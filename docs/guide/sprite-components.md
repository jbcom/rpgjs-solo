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