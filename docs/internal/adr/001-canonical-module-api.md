# ADR 001: Canonical Module API

- Status: Accepted
- Target: RPGJS v5 stable

## Context

RPGJS currently exposes decorated modules, `defineModule()`, `createModule()`,
client/server module providers, and feature-specific `provideX()` functions.
These mechanisms are compatible internally but present several competing paths
to users.

## Decision

- `defineModule()` is the canonical authoring API for gameplay modules.
- `provideX()` functions are the canonical installation and configuration API.
- `createServer()` and `startGame()` remain the application bootstrap APIs.
- `@RpgModule` remains supported throughout v5 as the v4 compatibility path.
- `createModule()` is documented as an advanced composition/DI tool rather than
  the first module concept taught to game authors.

The canonical module contract is runtime-specific:

- server definitions use `defineModule<RpgServer>()` and are installed with
  `provideServerModules()`
- client definitions use `defineModule<RpgClient>()` and are installed with
  `provideClientModules()`
- configurable framework features expose the same `provideFeature(options)`
  name from explicit `/server` and `/client` package entry points

Client and server files remain separate. A runtime entry point must not expose
or retain the implementation of the other runtime. Existing root exports may
remain as compatibility aliases during v5, but guides and starters use explicit
runtime entry points.

Feature providers may use `createModule()` internally while compatibility is
required, but this is not part of the normal gameplay-module authoring flow.

## Consequences

- guides, starters, and package READMEs need one consistent default pattern
- compatibility adapters must preserve decorated modules without changing hook behavior
- new modules must not introduce another installation convention
- DI remains available without becoming required knowledge for basic gameplay
- package entry points, rather than filename-only transforms, own the final
  client/server bundle boundary

## Validation

- one starter module covers maps, events, database, client components, and configuration
- the same module works in standalone and MMORPG modes
- a v4 decorated module and native v5 module can coexist
- packed `/client` and `/server` entry points contain no opposite-runtime code
