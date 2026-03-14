---
title: "State Commands"
description: "Apply, remove, and inspect player states."
---

# State Commands

Apply, remove, and inspect player states.

## Members

- [addState](#addstate)
- [applyStates](#applystates)
- [findStateEfficiency](#findstateefficiency)
- [getState](#getstate)
- [removeState](#removestate)
- [statesDefense](#statesdefense)
- [statesEfficiency](#statesefficiency)

## addState

Adds a state to the player

- Source: `packages/server/src/Player/StateManager.ts`
- Kind: `method`
- Defined in: `IStateManager`

### Signature

```ts
addState(stateClass: StateClass | string, chance?: number): object | null
```

### Parameters

- `stateClass`: `StateClass | string`
- `chance?`: `number`

### Returns

The state instance if successfully applied, null if already present

## applyStates

Apply states to a player from skill or item effects

- Source: `packages/server/src/Player/StateManager.ts`
- Kind: `method`
- Defined in: `IStateManager`

### Signature

```ts
applyStates(player: RpgPlayer, states: { addStates?: Array<{ state: any; rate: number }>; removeStates?: Array<{ state: any; rate: number }> }): void
```

### Parameters

- `player`: `RpgPlayer`
- `states`: `{ addStates?: Array<{ state: any; rate: number }>; removeStates?: Array<{ state: any; rate: number }> }`

## findStateEfficiency

Find state efficiency modifier for a specific state class

- Source: `packages/server/src/Player/StateManager.ts`
- Kind: `method`
- Defined in: `IStateManager`

### Signature

```ts
findStateEfficiency(stateClass: any): any | undefined
```

### Parameters

- `stateClass`: `any`

### Returns

The efficiency object if found, undefined otherwise

## getState

Get a state to the player. Returns null if the state is not present

- Source: `packages/server/src/Player/StateManager.ts`
- Kind: `method`
- Defined in: `IStateManager`

### Signature

```ts
getState(stateClass: StateClass | string): any | null
```

### Parameters

- `stateClass`: `StateClass | string`

### Returns

The state instance if found, null otherwise

## removeState

Remove a state to the player

- Source: `packages/server/src/Player/StateManager.ts`
- Kind: `method`
- Defined in: `IStateManager`

### Signature

```ts
removeState(stateClass: StateClass | string, chance?: number): void
```

### Parameters

- `stateClass`: `StateClass | string`
- `chance?`: `number`

## statesDefense

Gets the defensive capabilities against various states from equipped items

- Source: `packages/server/src/Player/StateManager.ts`
- Kind: `property`
- Defined in: `IStateManager`

### Signature

```ts
statesDefense: { rate: number; state: any }[]
```

### Returns

Array of state defense objects with rate and state properties

## statesEfficiency

Manages the player's state efficiency modifiers

- Source: `packages/server/src/Player/StateManager.ts`
- Kind: `property`
- Defined in: `IStateManager`

### Signature

```ts
statesEfficiency: any
```

### Returns

Signal containing array of state efficiency objects
