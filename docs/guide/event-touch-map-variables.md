---
title: "Event Touch and Map Variables"
description: "Build shared map interactions with onTouch, onTouchEnd, and persistent map variables."
---

# Event Touch and Map Variables

`onTouch` and `onTouchEnd` let an event react to any entity that collides with it: a player or another event. They are useful for pressure plates, push blocks, sensors, traps, doors, and shared MMO world state.

Use map variables for state that belongs to the map room and should be shared by every player on that map. Use player variables for state that belongs only to one player.

## Touch Context

```ts
import type { EventDefinition, RpgTouchContext } from '@rpgjs/server'
import type { RpgEvent, RpgPlayer } from '@rpgjs/server'

export const PressurePlate: EventDefinition = {
    name: 'PressurePlate',
    onTouch(other: RpgPlayer | RpgEvent, context: RpgTouchContext) {
        context.map.setVariable('door.open', true)

        if (context.player) {
            context.player.setVariable('lastPlateTouched', this.id)
        }
    },
    onTouchEnd(other: RpgPlayer | RpgEvent, context: RpgTouchContext) {
        context.map.setVariable('door.open', false)
    }
}
```

The context contains:

- `self`: the event running the hook
- `other`: the player or event touching it
- `otherType`: `'player'` or `'event'`
- `player`: the player when this is a player/event touch
- `phase`: `'start'` or `'end'`
- `pairId`: stable id for that collision pair
- `map`: the current `RpgMap`

For player/event collisions, `onTouch` runs before the legacy `onPlayerTouch` hook. For event/event collisions, both events receive `onTouch` and `onTouchEnd`.

## Shared Map State

```ts
export const Door: EventDefinition = {
    name: 'Door',
    onInit() {
        this.through = false
    },
    onChanges() {
        const map = this.getCurrentMap()
        const open = map?.getVariable<boolean>('door.open') === true

        this.through = open
        this.setGraphic(open ? 'door-open' : 'door-closed')
    }
}
```

Map variables are persistent room state:

```ts
map.setVariable('door.open', true)
map.getVariable<boolean>('door.open')
map.hasVariable('door.open')
map.removeVariable('door.open')
map.getVariableKeys()
map.clearVariables()
```

Writing, removing, or clearing a map variable automatically re-runs `onChanges` for visible players and events on that map. Player variables do the same for the player that owns the variable.

Variable writes inside `onChanges` are guarded against recursive loops. Prefer making `onChanges` compute display and collision state from existing variables, and write variables from gameplay hooks such as `onTouch`, `onTouchEnd`, or `onAction`.
