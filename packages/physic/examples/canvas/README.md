# Canvas Example

A simple interactive example demonstrating RPG Physic with HTML5 Canvas.

## Features

- **Interactive Physics**: Click to add balls, right-click for explosions
- **Collision Detection**: Balls bounce off walls and each other
- **Visual Feedback**: Velocity vectors shown on entities
- **Controls**: Buttons to add balls, clear, and create explosions

## Running

```bash
# From project root
npm run example

# Or with Vite directly
vite --mode example
```

The example will open in your browser at `http://localhost:3000`.

## Controls

- **Left Click**: Add a ball at cursor position
- **Right Click**: Create explosion at cursor position
- **Clear Button**: Remove all dynamic entities
- **Add 10 Balls Button**: Add 10 random balls
- **Explosion Button**: Create explosion at center

## Code Structure

- `index.html`: HTML structure with canvas
- `main.ts`: Physics simulation and rendering logic

The example uses the built library from `src/`, so make sure to build first:

```bash
npm run build
```

