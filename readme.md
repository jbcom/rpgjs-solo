![Header icon](/header.png)

<p align="center">
  <img src="https://img.shields.io/npm/v/@rpgjs/server" alt="Version">
  <img src="https://img.shields.io/npm/dm/@rpgjs/server" alt="Downloads">
  <img src="https://img.shields.io/github/license/RSamaium/RPG-JS" alt="License">
  <img src="https://img.shields.io/github/commit-activity/m/RSamaium/RPG-JS" alt="Activity">
</p>

# RPG JS v5 Beta: Create RPGs and MMORPGs in the browser

RPGJS is a TypeScript framework for building 2D browser RPGs and MMORPGs.

You write gameplay once, then run it either as a standalone RPG or as a networked MMORPG. RPGJS gives you the RPG-specific pieces that a generic web stack does not provide out of the box: maps, players, events, server/client synchronization, GUI, save/load, movement, collision, and multiplayer room flow.

The goal is not to be a generic 3D game engine. RPGJS focuses on the architecture and runtime needed to build RPG-style games on the web, while keeping the project extensible through TypeScript, Vite, dependency injection, and modular packages.

## Website and Documentation

- Website: [https://rpgjs.dev](https://rpgjs.dev)
- Documentation: [https://v5.rpgjs.dev](https://v5.rpgjs.dev)

## Why RPGJS?

RPGJS is useful when you want to build a game with RPG mechanics without assembling every engine layer yourself.

- One gameplay architecture for standalone RPG and MMORPG modes
- Authoritative server state for multiplayer projects
- Client-side prediction and reconciliation for responsive MMORPG movement
- Map-based world structure where each map can act as a room
- Built-in player, event, GUI, inventory, skill, save/load, and movement concepts
- Rendering with CanvasEngine, plus Vue overlays when DOM UI is a better fit
- Extensible services through dependency injection
- Vite-based development and build pipeline

## Mental Model

At a high level, an RPGJS game is organized around a few concepts:

```txt
Player input
  -> client prediction
  -> server validation
  -> synchronized state
  -> rendered world and GUI
```

Core ideas:

- **Server owns gameplay state**: player data, map state, items, skills, events, and save/load logic live on the gameplay side.
- **Client renders and reacts**: the browser renders maps, sprites, GUI, animations, and predicted movement.
- **Maps are runtime rooms**: in MMORPG mode, players connect to map rooms and can move between them.
- **Events are world entities**: NPCs, enemies, chests, triggers, and scripted interactions are modeled as events.
- **Modules extend the game**: features are added through modules and providers instead of hard-coded global setup.
- **Services are replaceable**: storage, map loading, networking, GUI, and other behaviors can be overridden.

## Getting Started

```bash
npx degit rpgjs/starter#v5 my-rpg-game
cd my-rpg-game
npm install
npm run dev
```

Open `http://localhost:5173`.

By default, the starter runs in MMORPG mode. To run the same project as a standalone RPG:

```bash
RPG_TYPE=rpg npm run dev
```

On Windows:

```bash
npm install --save-dev cross-env
npx cross-env RPG_TYPE=rpg npm run dev
```

If you use an AI coding assistant and want it to understand RPGJS v5 better, you can also install the RPGJS skill:

```bash
npx skills add https://github.com/RSamaium/RPG-JS#v5
```

## Playground

The repository includes a playground for trying RPGJS gameplay demos from one
screen. It keeps the game list on the left and loads the selected game in an
iframe on the right.

```bash
pnpm install
pnpm playground
```

Open `http://localhost:5174`.

Each game in `playground/games/*` is independent and has its own assets, RPGJS
configuration, Vite config, and `playground.config.json`. Add a new gameplay by
creating a new folder in `playground/games/<game-id>` and assigning it a unique
port in `playground.config.json`.

## Tiny Example

Server-side gameplay can stay close to RPG vocabulary:

```ts
import { RpgPlayer, type RpgPlayerHooks } from "@rpgjs/server";

export const player: RpgPlayerHooks = {
  onConnected(player: RpgPlayer) {
    player.name = "Hero";
    player.setGraphic("hero");
    player.setHitbox(32, 32);
    player.changeMap("town", { x: 120, y: 96 });
  }
};
```

An event can drive interactions:

```ts
import { RpgPlayer, type EventDefinition } from "@rpgjs/server";

export function GuardEvent(): EventDefinition {
  return {
    onInit() {
      this.setGraphic("guard");
    },
    async onAction(player: RpgPlayer) {
      await player.showText("The road is dangerous at night.");
    }
  };
}
```

The same project can then run as:

- a standalone RPG with `provideRpg(startServer)`
- an MMORPG with `provideMmorpg({})`

## When Should You Use RPGJS?

RPGJS is a good fit if you are building:

- a 2D RPG in the browser
- a multiplayer RPG or MMORPG
- a game with maps, NPCs, dialogs, inventories, skills, save/load, and events
- a Tiled-based RPG project
- a game that needs server/client separation without rewriting all gameplay logic twice

It is probably not the right tool if you mainly need:

- a 3D engine
- a FPS or physics sandbox
- a non-RPG game with completely custom runtime rules
- a rendering-only library

## Features

### Gameplay

- Players, events, maps, world maps, items, skills, states, effects, variables, switches, and dialogs
- Shared events for global world state, and scenario events for per-player progression
- Save/load system with replaceable storage
- Prebuilt GUI screens: title screen, game over, dialog box, HUD, main menu, shop, and save/load
- Action RPG combat package where events can become enemies

### Multiplayer

- Same project structure for standalone RPG and MMORPG modes
- Authoritative server state with synchronized client state
- Client-side prediction and server reconciliation for player movement
- Map-room architecture for large worlds
- Live MMORPG map and event updates without restarting the server

### Rendering and UI

- CanvasEngine rendering and component system
- Tiled Map Editor support through official packages
- Weather, animations, light halos, day/night effects, and visual atmosphere tools
- Mobile controls, keyboard, and gamepad input
- Vue integration for DOM overlays when needed
- RPG UI CSS package for reusable visual styling

### Architecture and Tooling

- TypeScript-first packages
- Vite-powered development and build
- Dependency injection for replacing engine services
- Server stack adapters for Node, Cloudflare Workers, and custom runtimes
- Vitest-based testing workflow
- RPGJS Studio integration for production tooling

## Learning Path

Start here:

1. [Quick Start](https://v5.rpgjs.dev/guide/quick-start)
2. [Getting Started](https://v5.rpgjs.dev/guide/get-started)
3. [Project Structure](https://v5.rpgjs.dev/guide/structure)
4. [Create your first map](https://v5.rpgjs.dev/guide/create-your-first-map)
5. [Create an event](https://v5.rpgjs.dev/guide/create-event)
6. [GUI](https://v5.rpgjs.dev/gui/)
7. [Save and Load](https://v5.rpgjs.dev/guide/save-load)
8. [V4 Compatibility](https://v5.rpgjs.dev/guide/v4-compatibility)

## V4 Compatibility

RPGJS v5 has a different runtime architecture from RPGJS v4, but a compatibility layer exists for v4-style project layouts.

Use `compatibilityV4Plugin()` from `@rpgjs/vite` to run a v4 module structure on the v5 runtime. See the [V4 compatibility guide](https://v5.rpgjs.dev/guide/v4-compatibility) and the `playground/games/v4-compat` project.

## Contribute to developments

To contribute to the developments, install the sources locally:

```bash
git clone https://github.com/RSamaium/RPG-JS.git
npm install
npm run dev
```

## Releases

RPGJS uses Changesets so every package can keep its own version. For each
publishable change, run:

```bash
pnpm changeset
```

Select the affected `@rpgjs/*` packages, choose the semver bump, and write a
short release note. When changes land on the `v5` branch, GitHub Actions creates
or updates a version PR. Merging that PR publishes the updated packages to npm.

Internal `@rpgjs/*` dependencies are updated during release. If a package depends
on another package that is being released, it receives at least a patch release
so the published npm ranges remain consistent.

## License

MIT. Free for commercial use.
