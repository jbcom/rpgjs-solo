![Header icon](/header.png)

<p align="center">
  <img src="https://img.shields.io/npm/v/@rpgjs/server" alt="Version">
  <img src="https://img.shields.io/npm/dm/@rpgjs/server" alt="Downloads">
  <img src="https://img.shields.io/github/license/RSamaium/RPG-JS" alt="License">
  <img src="https://img.shields.io/github/commit-activity/m/RSamaium/RPG-JS" alt="Activity">
</p>

# RPG JS v5 Beta : Create RPG and MMORPG in your browser

RPG JS is a versatile TypeScript framework meticulously designed to empower developers in the creation of both traditional Role-Playing Games (RPGs) and immersive Massively Multiplayer Online Role-Playing Games (MMORPGs). Our primary objective is to offer a seamless development experience where your codebase remains consistent, regardless of the game's nature.

With RPG JS, we aspire to provide developers with a robust foundation that adapts effortlessly to your creative vision. Whether you're crafting epic solo adventures or building vast multiplayer worlds, RPG JS ensures that your development journey remains cohesive and efficient. Our goal is to simplify the complexities of game development, allowing you to focus on bringing captivating stories and engaging gameplay to life.

## WebSite and Documentation

- Website: [https://rpgjs.dev](https://rpgjs.dev)
- Documentation: [https://v5.rpgjs.dev](https://v5.rpgjs.dev)

## Getting Started

```bash
npx degit rpgjs/starter#v5 my-rpg-game
cd my-rpg-game
npm install --legacy-peer-deps
npm run dev
```

Then go to port localhost:3000

If you use an AI coding assistant and want it to understand RPGJS v5 better, you can also install the RPGJS skill:

```bash
npx skills add https://github.com/RSamaium/RPG-JS#v5
```

> Note
> RPGJS v5 is currently not compatible with RPGJS v4.
> A migration path will be added later, along with ViteJS compatibility tools to help existing projects transition in the future.
> In the meantime, you can use [RPGJS Studio](https://rpgjs.studio/), review the [RPGJS v4 codebase](https://github.com/RSamaium/RPG-JS/tree/v4), and read the [RPGJS v4 documentation](https://docs.rpgjs.dev/).

## Features

| Feature | Description |
|---|---|
| 🔄 One Codebase for RPG and MMORPG | Build a single-player RPG or a full MMORPG with the same architecture and gameplay code. |
| 🚀 Scalability-First MMORPG Design | Each map can run on a different server. When a player moves to another map, the client disconnects from the current server and reconnects to the next one, enabling large-scale worlds and high player counts. |
| 🎯 Client-Side Prediction and Server Reconciliation | In MMORPG mode, player movement benefits from client-side prediction for responsiveness, while server reconciliation keeps the final state authoritative and synchronized. |
| 🗺️ Map-Agnostic Architecture | RPG JS does not lock you into one map format or renderer. You can build your own map pipeline, while official packages already support Tiled Map Editor. |
| 📱 Cross-Platform Input | Support mobile controls, gamepads, and keyboard inputs for flexible play across devices. |
| 🧩 CanvasEngine UI System | Build UI with CanvasEngine using graphical or DOM-based components, with Vue.js compatibility when needed. |
| ⚡ Reactive by Nature | Core engine properties are reactive on both client and server, with signals and side effects built into the programming model. |
| 🏗️ Dependency Injection | Override services and classes depending on the environment or the type of game, making the engine highly extensible. |
| ⚙️ Vite-Powered Workflow | Development and build are based on Vite. Add the `rpgjs()` plugin and use a modern toolchain out of the box. |
| 🧪 Vitest Testing | Write unit tests with Vitest to validate gameplay logic and keep your project stable over time. |
| 💻 TypeScript-First | Develop with TypeScript for stronger structure, safer refactoring, and clearer game code. |
| 🛡️ RPG-Focused Physics | Use a built-in physics library designed for RPG needs, including collisions, interactions, and map-aware movement. |
| ⚔️ Action Battle System | The engine includes an action RPG combat system where an event can become an enemy. |
| 🖼️ Built-In GUI Screens | Start faster with prebuilt interfaces such as title screen, game over, dialog box, HUD, main menu, shop, and save/load screens. |
| 🎨 RPG UI Styling | Customize the provided CSS library made specifically for RPG interfaces. |
| 💾 Agnostic Save System | Decide how data is saved and loaded: local storage, API calls, external services, or your own persistence layer. |
| 🌐 Agnostic Server Stack | Use the backend you want behind RPG JS, including Express, Fastify, Cloudflare Workers, or custom server adapters. |
| 🌍 Shared or Scenario Events | Use `shared` mode when the world state must be global, such as enemies, public switches, or moving NPCs. Use `scenario` mode when each player needs personal progression, such as private chests, puzzles, or solo cutscenes. |
| 🏃 Advanced Movement Strategies | Add rich movement behaviors to characters: linear movement, dash, knockback, path following, oscillation, AI pathfinding, ice movement, and projectile movement. |
| 🏢 RPGJS Studio Integration | Connect your game to the RPGJS Studio backend and extend your production workflow. |
| 🔄 Live MMORPG Map Updates | In MMORPG mode, update maps and events through a request without restarting the server. |
| 🌦️ World Effects and Atmosphere | Add weather, animations, day/night cycles, light halos, and other visual world effects. |

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
