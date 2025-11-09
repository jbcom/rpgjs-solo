# RPG Example

This example demonstrates a complete RPG-style game using RPG Physic library.

## Features

- **Hero Character**: Controlled with WASD or arrow keys
- **NPCs**: Non-player characters that wander around
- **Static Environment**: Walls, obstacles, and decorative trees
- **Camera System**: Smooth camera following the hero
- **Collision Detection**: Full physics-based collisions between all entities

## Controls

- **WASD** or **Arrow Keys**: Move the hero
- **Z** or **Q**: Alternative keys for up/left (AZERTY layout)

## Running the Example

```bash
npm run example:dev
```

Then navigate to the RPG example in your browser.

## Architecture

- Uses `PhysicsEngine` for physics simulation
- Entities are categorized as: hero, npc, wall, obstacle, tree
- Camera system uses smooth interpolation (lerp) for following
- Keyboard input directly sets entity velocity
- NPCs use simple random wandering AI

