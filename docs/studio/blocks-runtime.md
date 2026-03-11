---
title: "Studio blocks runtime"
description: "How the Studio visual scripting block system maps definitions, schemas, and executors into the RPGJS runtime."
---

# Studio blocks runtime

The Studio block system is the execution layer behind visual event programming.

It connects four concerns:

- The editor UI, which builds and edits block trees
- Shared block definitions and schemas
- Runtime execution services
- Validation for generated or user-authored blocks

## Execution flow

1. A block type is declared in the shared definitions.
2. Its parameters are typed in the runtime block types.
3. An executor implements the runtime behavior.
4. The execution service resolves the block and runs it in game context.

## Important files

- `packages/studio/runtime/blocks/definitions.ts`
- `packages/studio/runtime/blocks/types.ts`
- `packages/studio/runtime/blocks/executors.ts`
- `packages/studio/src/block-executor.ts`

## Runtime context

Executors run with game-aware context, including access to the current player, event, variables, switches, and helper methods used by RPGJS event logic.

## Why it matters

This is the part of Studio you need to understand when you want to:

- Add a new visual block
- Map editor data to engine behavior
- Debug block execution
- Document the contract between Studio and the game runtime

## Related documentation

- [Studio overview](/studio/index)
- [Internal event modes architecture](/internal/event-modes-architecture)
