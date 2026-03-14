---
title: JSDoc generation
description: Internal notes for generating API pages from JSDoc comments.
---

# JSDoc generation

This page documents the internal workflow used to generate Markdown API pages from JSDoc comments in RPGJS packages.

## Goal

The generator has two responsibilities:

1. Extract documented symbols from a TypeScript package.
2. Render Markdown pages for Mintlify from a configuration file.

The current first use case is the server-side `Player API`, but the CLI is generic enough to be reused for other packages later.

## Files involved

- `bin/extract-jsdoc.ts`: generic extraction and rendering CLI
- `docs/api/player.config.json`: rendering config for the Player API pages
- `docs/.generated/server-api.json`: intermediate generated JSON index
- `docs/api/player/*.md`: generated Markdown pages

## Commands

Extract raw JSDoc data from a package:

```bash
pnpm docs:extract-api extract \
  --package @rpgjs/server \
  --entry packages/server/src \
  --output docs/.generated/server-api.json
```

Generate the Player API Markdown pages:

```bash
pnpm docs:player-api
```

Generate the Map API Markdown pages:

```bash
pnpm docs:map-api
```

Generate the Client API Markdown pages:

```bash
pnpm docs:client-api
```

The generated API scripts run both steps:

1. Extract JSDoc from `@rpgjs/server`
2. Render the pages in the target docs folder

## How the extractor works

The extractor parses TypeScript source files with `ts-morph` and collects documented:

- methods
- properties
- getters
- setters
- function declarations

It reads the main JSDoc fields used in the codebase:

- comment body
- `@title`
- `@method`
- `@prop`
- `@param`
- `@returns`
- `@default`
- `@example`
- `@since`
- `@memberof`

The output is a JSON index so rendering can stay separate from extraction.

## How rendering works

Rendering is config-driven. The config decides:

- which sections exist
- which files belong to each section
- which `ownerNames` or `memberof` values to include
- the output Markdown filenames

For Player API, the sections map to the manager files:

- `ParameterManager`
- `GoldManager`
- `VariableManager`
- `GuiManager`
- `MoveManager`
- and the other Player managers

## Updating the Player API

When JSDoc changes in `packages/server/src/Player`, regenerate the pages:

```bash
pnpm docs:player-api
```

Check a few generated pages manually, especially:

- `docs/api/player/index.md`
- `docs/api/player/common-commands.md`
- `docs/api/player/gui-commands.md`
- `docs/api/player/variable-commands.md`
- `docs/api/map/index.md`
- `docs/api/map/rpg-map.md`
- `docs/api/map/world-maps.md`
- `docs/api/client/index.md`
- `docs/api/client/rpg-client-engine.md`

## Adding a new generated API section

To generate docs for another package or another API surface:

1. Reuse `bin/extract-jsdoc.ts`
2. Create a new config file similar to `docs/api/player.config.json`
3. Point the config to the relevant `sourceFiles`, `ownerNames`, or `memberof` tags
4. Add a package script if the workflow should be reused often
5. Add the generated pages to `docs/docs.json` only if they should be public

## Important notes

- `docs/api/player`, `docs/api/map`, and `docs/api/client` are committed to the repository.
- `docs/.generated` is only an intermediate build artifact and is ignored.
- The quality of generated pages depends directly on the quality and consistency of the JSDoc in source files.
- For now, the generator supports the current RPGJS JSDoc style. If tags become more standardized later, the renderer can be tightened.
