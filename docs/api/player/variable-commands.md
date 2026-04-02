---
title: "Variable Commands"
description: "Store and retrieve player variables that persist across saves and map transfers."
---

# Variable Commands

Store and retrieve player variables.

Player variables are not just generic temporary values.

They are primarily used to:

- persist player-specific state for saves
- keep player state when moving from one map to another
- transfer that state through the player snapshot, even if the next map is hosted on another server

Use them for quest flags, chest states, dialogue progression, switches, and any per-player value that must survive reconnects and map changes.

## Members

- [clearVariables](#clearvariables)
- [getVariable](#getvariable)
- [getVariableKeys](#getvariablekeys)
- [hasVariable](#hasvariable)
- [removeVariable](#removevariable)
- [setVariable](#setvariable)
- [variables](#variables)

## clearVariables

Clear all variables

- Source: `packages/server/src/Player/VariableManager.ts`
- Kind: `method`
- Defined in: `IVariableManager`

### Signature

```ts
clearVariables(): void
```

## getVariable

Get a variable value

- Source: `packages/server/src/Player/VariableManager.ts`
- Kind: `method`
- Defined in: `IVariableManager`

### Signature

```ts
getVariable(key: string): U | undefined
```

### Parameters

- `key`: `string`

### Returns

The stored value or undefined if not found

## getVariableKeys

Get all variable keys

- Source: `packages/server/src/Player/VariableManager.ts`
- Kind: `method`
- Defined in: `IVariableManager`

### Signature

```ts
getVariableKeys(): string[]
```

### Returns

Array of all variable keys

## hasVariable

Check if a variable exists

- Source: `packages/server/src/Player/VariableManager.ts`
- Kind: `method`
- Defined in: `IVariableManager`

### Signature

```ts
hasVariable(key: string): boolean
```

### Parameters

- `key`: `string`

### Returns

true if the variable exists, false otherwise

## removeVariable

Remove a variable

- Source: `packages/server/src/Player/VariableManager.ts`
- Kind: `method`
- Defined in: `IVariableManager`

### Signature

```ts
removeVariable(key: string): boolean
```

### Parameters

- `key`: `string`

### Returns

true if a variable existed and has been removed, false otherwise

## setVariable

Assign a variable to the player.

Use this for player state that must be persisted and restored later, such as quest progression or whether a personal chest has already been opened.

- Source: `packages/server/src/Player/VariableManager.ts`
- Kind: `method`
- Member of: `VariableManager`
- Defined in: `IVariableManager`

### Signature

```ts
setVariable(key: string, val: any): void
```

### Parameters

- `key`: `string`
- `val`: `any`

## variables

Map storing all player variables.

These values belong to the player, are persisted, and travel with the player snapshot during map changes.

- Source: `packages/server/src/Player/VariableManager.ts`
- Kind: `property`
- Defined in: `IVariableManager`

### Signature

```ts
variables: Map<string, any>
```
