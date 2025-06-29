# Display Animations

This guide explains how to display animations in RPG-JS. There are two main types of animations you can create and display:

1. **Spritesheet Animations** - Using image spritesheets with the built-in animation system
2. **Custom Component Animations** - Creating your own Canvas Engine components for complex effects

## Spritesheet Animations

### 1. Creating the Animation Spritesheet

First, you need to create an animation spritesheet and add it to your module's spritesheets configuration.

#### Using AnimationSpritesheetPreset

The easiest way is to use the built-in `AnimationSpritesheetPreset` helper:

```ts
import { Presets } from "@rpgjs/client";

// In your client module configuration
spritesheets: [
  {
    id: "explosion",
    width: 1024,
    height: 1024,
    image: "explosion.png",
    ...Presets.AnimationSpritesheetPreset(4, 4), // 4x4 grid = 16 frames
  }
]
```

The `AnimationSpritesheetPreset(framesWidth, framesHeight)` automatically generates frame coordinates for a grid-based spritesheet. For example, `AnimationSpritesheetPreset(4, 4)` creates 16 frames arranged in a 4x4 grid.

#### Manual Spritesheet Configuration

You can also manually configure your spritesheet:

```ts
spritesheets: [
  {
    id: "custom-animation",
    image: "my-animation.png",
    width: 512,
    height: 512,
    framesWidth: 8,
    framesHeight: 2,
    textures: {
      default: {
        animations: () => [
          [
            { time: 0, frameX: 0, frameY: 0 },
            { time: 100, frameX: 1, frameY: 0 },
            { time: 200, frameX: 2, frameY: 0 },
            // ... more frames
          ]
        ],
      }
    }
  }
]
```

### 2. Displaying Spritesheet Animations

#### On a Player

Use the `showAnimation` method on a player instance:

```ts
/**
 * Display an animation on a player
 * @param graphic - The spritesheet ID
 * @param animationName - Animation name (default: 'default')
 * @param replaceGraphic - Whether to replace the player's graphic (default: false)
 */
player.showAnimation(graphic: string, animationName: string = 'default', replaceGraphic: boolean = false)
```

**Examples:**

```ts
// Show explosion animation on player
player.showAnimation("explosion");

// Show specific animation from spritesheet
player.showAnimation("spell-effects", "fireball");

// Replace player graphic with animation
player.showAnimation("transformation", "default", true);
```

#### On a Map

Use the `showAnimation` method on a map instance:

```ts
/**
 * Display an animation at a specific position on the map
 * @param position - The x, y coordinates where to display the animation
 * @param graphic - The spritesheet ID
 * @param animationName - Animation name (default: 'default')
 */
map.showAnimation(position: { x: number, y: number }, graphic: string, animationName: string = 'default')
```

**Examples:**

```ts
// Show explosion at specific coordinates
map.showAnimation({ x: 100, y: 200 }, "explosion");

// Show spell effect at player position
const playerPos = { x: player.x, y: player.y };
map.showAnimation(playerPos, "spell-effects", "lightning");
```

## Custom Component Animations

For more complex animations with custom logic, you can create Canvas Engine components.

### 1. Creating a Custom Animation Component

Create a Canvas Engine component file (e.g., `ExplosionComponent.ce`):

```ts
<Sprite sheet x y anchor={0.5} scale alpha={opacity} />

<script>
  import { animatedSignal, mount, tick } from "canvasengine";
  import { inject, RpgClientEngine } from "@rpgjs/client";

  // Get props passed from server
  const { 
    x, 
    y, 
    onFinish,     // Required: callback to remove animation when done
    intensity,    // Custom parameter
    color,        // Custom parameter
    duration      // Custom parameter with default value
  } = defineProps({
    duration: {
      default: 1000
    },
    intensity: {
      default: 1
    },
    color: {
      default: 'white'
    }
  });

  const client = inject(RpgClientEngine);
  const spritesheets = client.spritesheets;

  // Animation properties
  const scale = animatedSignal(0.1, { duration: duration() });
  const opacity = animatedSignal(1, { duration: duration() });

  // Setup spritesheet
  const sheet = {
    definition: spritesheets.get('explosion'),
    playing: 'default'
  };

  // Start animation on mount
  mount(() => {
    scale.set(intensity() * 2);
    opacity.set(0);
  });

  // Handle animation completion
  let elapsedTime = 0;
  tick(({ deltaTime }) => {
    elapsedTime += deltaTime;
    
    if (elapsedTime >= duration()) {
      if (onFinish) {
        onFinish(); // This removes the animation
      }
    }
  });
</script>
```

### 2. Registering the Component Animation

Add your component to the module configuration:

```ts
import ExplosionComponent from "./components/ExplosionComponent.ce";
import { RpgClient, defineModule } from "@rpgjs/client";

export default defineModule<RpgClient>({
  componentAnimations: [
    {
      id: "explosion",
      component: ExplosionComponent
    }
  ]
});
```

### 3. Displaying Custom Component Animations

#### On a Player

Use the `showComponentAnimation` method:

```ts
/**
 * Display a component animation on a player
 * @param id - The component animation ID
 * @param params - Parameters to pass to the component
 */
player.showComponentAnimation(id: string, params: any)
```

**Examples:**

```ts
// Basic explosion on player
player.showComponentAnimation("explosion", {});

// Explosion with custom parameters
player.showComponentAnimation("explosion", {
  intensity: 2.5,
  color: "red",
  duration: 1500
});

// Hit indicator with damage text
player.showComponentAnimation("hit", {
  text: "150",
  color: "red"
});

// Heal animation
player.showComponentAnimation("heal", {
  amount: 50,
  color: "green"
});
```

#### On a Map

Use the `showComponentAnimation` method on the map:

```ts
/**
 * Display a component animation at a specific position
 * @param id - The component animation ID
 * @param position - The x, y coordinates
 * @param params - Parameters to pass to the component
 */
map.showComponentAnimation(id: string, position: { x: number, y: number }, params: any)
```

**Examples:**

```ts
// Explosion at specific location
map.showComponentAnimation("explosion", { x: 300, y: 400 }, {
  intensity: 3,
  duration: 2000
});

// Area effect at multiple positions
const positions = [
  { x: 100, y: 100 },
  { x: 150, y: 120 },
  { x: 200, y: 140 }
];

positions.forEach(pos => {
  map.showComponentAnimation("sparkle", pos, {
    color: "gold",
    size: 0.8
  });
});
```
## Best Practices

### 1. Animation Performance

- Keep spritesheet sizes reasonable (max 2048x2048)
- Limit the number of simultaneous animations
- Use `onFinish` callback to properly clean up component animations

### 2. Parameter Validation

Always provide default values for component parameters:

```ts
const { 
  duration,
  intensity 
} = defineProps({
  duration: { default: 1000 },
  intensity: { default: 1 }
});
```

### 3. Memory Management

Component animations are automatically cleaned up when `onFinish` is called. Always call this callback when your animation completes:

```ts
// In your component animation
tick(({ deltaTime }) => {
  elapsedTime += deltaTime;
  
  if (elapsedTime >= duration()) {
    if (onFinish) {
      onFinish(); // Essential for cleanup
    }
  }
});
```