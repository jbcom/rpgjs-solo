---
name: rpgjs-v5-project
description: Manage, inspect, and implement work in an internal RPGJS v5 game project. Use when Codex needs to work on a codebase that should be an RPGJS v5 project, especially for gameplay features, maps, events, server/client code, `@rpgjs/*` dependencies, Tiled-based content, or `.ce` UI files. Also use when Codex must first verify whether the current project is actually an RPGJS project and, if not, stop and direct the user to set one up from the RPGJS v5 quick start.
---

# RPGJS v5 Project

## Overview

Use this skill to work inside an RPGJS v5 project with the live documentation as source of truth. Start by proving that the current codebase is an RPGJS project, then load the relevant RPGJS and CanvasEngine docs with `curl` or an equivalent CLI fetcher before making changes.

## Start Here

Verify that the current workspace is an actual RPGJS project before doing anything else.

Inspect one or more `package.json` files and look for `@rpgjs` packages.

Useful commands:

```bash
rg -n '"@rpgjs|@rpgjs/' . --glob 'package.json'
rg --files . | rg 'package.json$'
```

If no project-local `package.json` uses `@rpgjs/*`, stop and tell the user to set up an RPGJS v5 project first.

Point them to the RPGJS v5 quick start and tell them that a fresh install already includes Tiled map editor integration and example maps, so they should start from that baseline instead of hand-assembling the project.

Use this URL:

`https://v5.rpgjs.dev/guide/quick-start.md`

## Load Live Documentation

Do not rely on memory for RPGJS v5 usage details. Fetch the documentation with `curl` or a similar CLI tool and read the relevant pages before changing code.

Fetch the RPGJS documentation index:

```bash
curl -fsSL https://v5.rpgjs.dev/llms.txt
```

Use the `llms.txt` file as the table of contents. Extract the relevant Markdown links from it, then fetch the pages you need.

Example workflow:

```bash
curl -fsSL https://v5.rpgjs.dev/llms.txt -o /tmp/rpgjs-v5-llms.txt
rg -o 'https://[^ )]+\\.md' /tmp/rpgjs-v5-llms.txt
curl -fsSL https://v5.rpgjs.dev/guide/quick-start.md
```

If the `llms.txt` uses relative links, resolve them against `https://v5.rpgjs.dev/`.

Prefer reading only the pages needed for the task. Keep the fetched docs small and targeted.

## CanvasEngine Rule For `.ce` Files

Treat every `.ce` file as CanvasEngine code.

Before editing, creating, or explaining a `.ce` file, fetch the CanvasEngine documentation index:

```bash
curl -fsSL https://canvasengine.net/llms.txt
```

Then fetch the relevant Markdown pages referenced there. Do not invent CanvasEngine syntax from memory when the docs can be read directly.

If the task touches menus, HUDs, overlays, dialogs, title screens, or any file ending in `.ce`, load CanvasEngine docs first and then inspect nearby project components for local conventions.

## Working Sequence

Follow this order:

1. Confirm that the current workspace is an RPGJS project by checking `package.json` for `@rpgjs/*`.
2. If not, stop and direct the user to the quick start page.
3. Fetch `https://v5.rpgjs.dev/llms.txt` with `curl` or equivalent.
4. Fetch the specific RPGJS Markdown pages needed for the task.
5. If `.ce` files are involved, fetch `https://canvasengine.net/llms.txt` and the relevant CanvasEngine Markdown pages too.
6. Inspect the local codebase for conventions before editing.
7. Implement changes and verify them with the project’s normal commands.

## Project Cues

In an RPGJS v5 project, expect some mix of these signals:

- `@rpgjs/*` dependencies in `package.json`
- `client.ts`, `server.ts`, and sometimes `standalone.ts` entrypoints
- `config.client.*` and `config.server.*` configuration files
- server/client/common split
- map or world content tied to Tiled
- gameplay classes, event definitions, and map logic
- UI components written as `.ce` files

Treat the existing project structure as the primary convention source after the docs.

## Editing Guidance

Read the closest existing files before creating new gameplay objects, map logic, or UI components.

When working on gameplay or engine integration:

- verify imports and APIs against the fetched RPGJS docs
- prefer matching nearby project patterns over generic abstractions
- keep server/client responsibilities aligned with the current codebase
- check whether maps are loaded through `provideTiledMap` or a custom `provideLoadMap`

When working on `.ce` components:

- verify CanvasEngine syntax against fetched docs
- inspect sibling `.ce` files for established patterns
- preserve the existing component style unless the user asks for a broader refactor

## References

Read [source-map.md](./references/source-map.md) when you need the canonical doc URLs and the minimal fetch workflow.
Read [architecture-notes.md](./references/architecture-notes.md) when you need the core RPGJS v5 project model used by this repository.
