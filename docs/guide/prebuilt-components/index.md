---
title: "Prebuilt Components"
description: "Guide for Prebuilt Components in RPGJS."
---

# Prebuilt Components

RPGJS includes a collection of prebuilt sprite components that you can use directly in your game. These components are ready to use out of the box and can be customized through props to match your game's aesthetic.

## Available Components

### Light Halo

An animated light effect that creates a beautiful pulsing glow around sprites. Perfect for:
- Atmospheric lighting effects
- Magical auras and enchantments
- Ambient glow for characters and objects
- Dynamic lighting that responds to sprite state

[Learn more about Light Halo →](./light-halo)

## Using Prebuilt Components

All prebuilt components follow the same pattern as custom sprite components. You can use them in your module configuration:

```typescript
import { RpgClient, defineModule } from '@rpgjs/client';
import LightHalo from '@rpgjs/client';

export default defineModule<RpgClient>({
  sprite: {
    componentsBehind: [LightHalo]
  }
})
```

Or configure them with custom props:

```typescript
export default defineModule<RpgClient>({
  sprite: {
    componentsBehind: [{
      component: LightHalo,
      props: {
        baseRadius: 50,
        lightColor: 0xffaaaa
      }
    }]
  }
})
```

## See Also

- [Sprite Components Guide](/guide/sprite-components.md) - Learn how to create and use sprite components
- [CanvasEngine Documentation](https://canvasengine.net/) - Deep dive into the rendering engine
