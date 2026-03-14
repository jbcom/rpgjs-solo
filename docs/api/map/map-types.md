---
title: "Map Types"
description: "Supporting interfaces related to map controls and event hooks."
---

# Map Types

Supporting interfaces related to map controls and event hooks.

## Members

- [enableAntiCheat](#enableanticheat)
- [maxFrameDelta](#maxframedelta)
- [maxInputsPerTick](#maxinputspertick)
- [maxTimeDelta](#maxtimedelta)
- [minTimeBetweenInputs](#mintimebetweeninputs)
- [onAction](#onaction)
- [onChanges](#onchanges)
- [onDetectInShape](#ondetectinshape)
- [onDetectOutShape](#ondetectoutshape)
- [onInit](#oninit)
- [onInShape](#oninshape)
- [onOutShape](#onoutshape)
- [onPlayerTouch](#onplayertouch)

## enableAntiCheat

Whether to enable anti-cheat validation

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `Controls`

### Signature

```ts
enableAntiCheat: boolean
```

## maxFrameDelta

Maximum allowed frame delta between inputs

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `Controls`

### Signature

```ts
maxFrameDelta: number
```

## maxInputsPerTick

Maximum number of queued inputs processed per server tick

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `Controls`

### Signature

```ts
maxInputsPerTick: number
```

## maxTimeDelta

Maximum allowed time delta between inputs in milliseconds

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `Controls`

### Signature

```ts
maxTimeDelta: number
```

## minTimeBetweenInputs

Minimum time between inputs in milliseconds

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `Controls`

### Signature

```ts
minTimeBetweenInputs: number
```

## onAction

Called when a player performs an action on this event

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `EventHooks`

### Signature

```ts
onAction: (player: RpgPlayer) => void
```

## onChanges

Called when the event properties change

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `EventHooks`

### Signature

```ts
onChanges: (player: RpgPlayer) => void
```

## onDetectInShape

Called when a player is detected entering a shape

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `EventHooks`

### Signature

```ts
onDetectInShape: (player: RpgPlayer, shape: RpgShape) => void
```

## onDetectOutShape

Called when a player is detected exiting a shape

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `EventHooks`

### Signature

```ts
onDetectOutShape: (player: RpgPlayer, shape: RpgShape) => void
```

## onInit

Called when the event is first initialized

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `EventHooks`

### Signature

```ts
onInit: () => void
```

## onInShape

Called when a player enters a shape

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `EventHooks`

### Signature

```ts
onInShape: (zone: RpgShape, player: RpgPlayer) => void
```

## onOutShape

Called when a player exits a shape

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `EventHooks`

### Signature

```ts
onOutShape: (zone: RpgShape, player: RpgPlayer) => void
```

## onPlayerTouch

Called when a player touches this event

- Source: `packages/server/src/rooms/map.ts`
- Kind: `property`
- Defined in: `EventHooks`

### Signature

```ts
onPlayerTouch: (player: RpgPlayer) => void
```
