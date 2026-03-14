---
title: "Getting Started"
description: "Understand what RPGJS gives you before building your first game."
---

# Getting Started

RPGJS is a TypeScript framework for building browser RPGs and MMORPGs with the same core architecture.

The default stack is:

- TypeScript for game code
- Vite for dev and build
- CanvasEngine for rendering
- RPGJS server and client packages for gameplay and networking

## RPG or MMORPG

With the same project structure, you can run:

- a standalone RPG with `provideRpg(startServer)`
- an MMORPG with `provideMmorpg()`

That is why the starter contains both `client.ts` and `standalone.ts`.

## Recommended learning path

- [Quick Start](/guide/quick-start)
- [Structure](/guide/structure)
- [Create your first map](/guide/create-your-first-map)
- [Create hero in map](/guide/create-hero-in-map)
- [Create spritesheet](/guide/create-spritesheet)
- [Create a world](/guide/create-world)
- [Create an event](/guide/create-event)
- [Create database](/guide/create-database)
- [Create sounds](/guide/create-sounds)

## Browser support

The client targets modern browsers such as Chrome, Firefox, Edge, and Brave.

Internet Explorer is not supported.
