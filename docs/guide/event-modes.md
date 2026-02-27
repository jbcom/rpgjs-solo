---
title: "Event Modes: Shared vs Scenario"
description: "Guide for Event Modes: Shared vs Scenario in RPGJS."
---

# Event Modes: Shared vs Scenario

Events can run in two different modes:

- `shared`: one authoritative event instance for everyone on the map.
- `scenario`: one event instance per player (isolated view and state).

Use `shared` when the world state must be global (enemies, public switches, moving NPCs).  
Use `scenario` when each player needs a personal progression (private chest, personal puzzle, solo cutscene state).

## Shared Mode

In `shared` mode, all players see the same event:

- same position
- same direction
- same movement route
- same graphic/state
- same collisions

If one player moves or triggers that event, other players observe the same world change.

## Scenario Mode

In `scenario` mode, each player gets their own event instance:

- each player sees their own position/state for that event
- each player can progress independently
- event interactions and movement are isolated per player

Typical case: a chest that can be opened individually for each player.

## How to Set the Mode (Function Style)

You can define events with a simple function returning an object:

```ts
import { EventMode } from "@rpgjs/server";

export function SharedMonsterEvent() {
  return {
    name: "MonsterA",
    mode: EventMode.Shared,
    onInit() {
      this.setGraphic("monster");
    },
  };
}

export function ScenarioChestEvent() {
  return {
    name: "ChestA",
    mode: EventMode.Scenario,
    onAction(player) {
      // each player opens their own chest instance
      player.gold += 100;
    },
  };
}
```

`shared` is the default mode if you omit `mode`.

## Practical Rule of Thumb

- Pick `shared` for gameplay that should affect everyone.
- Pick `scenario` for content that should feel private per player.

## Performance Notes

`scenario` duplicates events per connected player.  
If a map contains many scenario events, CPU/memory and collision cost increase with player count.

Prefer:

- only essential events in scenario mode
- lightweight logic per scenario event
- shared mode whenever isolation is not required
