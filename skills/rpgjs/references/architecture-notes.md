# Architecture Notes

## Entry Points

Expect three possible entrypoints:

- `client.ts`
- `server.ts`
- `standalone.ts`

Use `standalone.ts` for a classic single-package RPG flow because it loads both client and server.

Use only `client.ts` and `server.ts` for an MMORPG-style setup.

## Configuration

Expect client and server configuration files, typically `config.client.*` and `config.server.*`.

The configuration layer already relies on dependency injection with providers.

Maps must be wired through a provider:

- use `provideTiledMap` when the project uses Tiled maps directly
- otherwise use a custom `provideLoadMap` implementation, as documented by RPGJS

Before changing map loading behavior, inspect the existing config and verify the expected provider in the docs.

## Modules And Hooks

Most gameplay behavior is implemented through hooks on both client and server sides.

Modules can stay lightweight or be wrapped in a dedicated folder with `defineModule` when the feature should be encapsulated, reusable, or shared with the community.

Prefer `defineModule` when the feature has its own hooks, assets, and internal structure rather than scattering code across unrelated files.

## Client Responsibilities

Spritesheets are an important client concern. They define the visual resources for characters and other renderable entities.

Because the stack uses Vite, static images are typically stored in the `public/` directory.

When adding visual assets:

- check how existing spritesheets are registered
- keep asset paths aligned with Vite public-file conventions
- verify any client hook or config registration needed for the asset to load

## Server Responsibilities

Player lifecycle hooks are central on the server side.

Important distinctions:

- `onConnected`: fires when the player connects to the server
- `onStart`: fires when the player explicitly starts after a title screen or equivalent manual start flow
- `onJoinMap`: fires after the player has joined a map

Do not treat `onConnected` and `onStart` as interchangeable.

In a common flow, a newly connected player arrives in a lobby context and then a `player.changeMap(...)` call sends them to the intended map.

## Map Model

In RPGJS, a map is also a room.

Treat maps as potentially independent runtime units. A map can live on one server while another map lives on another server.

When a player moves between maps, the engine transfers a snapshot of the player state so the object can be restored on the destination side.

This means that map transitions are not only visual. They are also part of the persistence and transfer model.

## Player API

Server hooks often expose `player` as an `RpgPlayer`-style object from the Player API.

Use the Player API for operations such as:

- money
- variables
- movement
- inventory or objects
- map changes

Before adding custom state outside the Player API, verify whether the existing player variable system already covers the need.

## Events And Collisions

A map can contain both players and events.

Events react through hooks, including collision-style or interaction-style behaviors such as:

- the player touches the event
- the player triggers an action on the event

Use these hooks to implement scenario logic, encounters, interactions, and map-local behaviors.

## Variables

Variables are a core RPGJS concept and should be preferred for game-state conditions that need to persist or drive map behavior.

Variables are important because they:

- survive player transfers between maps
- fit general save workflows, including possible database persistence
- participate in automatic change detection inside RPGJS

The automatic change detection matters for map logic. For example, an event can appear only when a variable becomes `true`, and RPGJS can react to that state change automatically.

Prefer the built-in variable system over ad hoc flags when the state should affect visibility, progression, persistence, or event conditions.
