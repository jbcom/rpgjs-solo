# ADR 001: Canonical Module API

- Status: Proposed
- Target: RPGJS v5 stable

## Context

RPGJS currently exposes decorated modules, `defineModule()`, `createModule()`,
client/server module providers, and feature-specific `provideX()` functions.
These mechanisms are compatible internally but present several competing paths
to users.

## Proposed decision

- `defineModule()` is the canonical authoring API for gameplay modules.
- `provideX()` functions are the canonical installation and configuration API.
- `createServer()` and `startGame()` remain the application bootstrap APIs.
- `@RpgModule` remains supported throughout v5 as the v4 compatibility path.
- `createModule()` is documented as an advanced composition/DI tool rather than
  the first module concept taught to game authors.

Client and server files may remain separate, but must compose through the same
module contract and have explicit bundle ownership.

## Consequences

- guides, starters, and package READMEs need one consistent default pattern
- compatibility adapters must preserve decorated modules without changing hook behavior
- new modules must not introduce another installation convention
- DI remains available without becoming required knowledge for basic gameplay

## Validation

- one starter module covers maps, events, database, client components, and configuration
- the same module works in standalone and MMORPG modes
- a v4 decorated module and native v5 module can coexist
