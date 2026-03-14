---
title: "Class Commands"
description: "Assign and inspect player classes and class-driven behaviors."
---

# Class Commands

Assign and inspect player classes and class-driven behaviors.

## Members

- [setActor](#setactor)
- [setClass](#setclass)

## setActor

Set up the player as a specific actor archetype

- Source: `packages/server/src/Player/ClassManager.ts`
- Kind: `method`
- Defined in: `IClassManager`

### Signature

```ts
setActor(actorClass: ActorClass | string): any
```

### Parameters

- `actorClass`: `ActorClass | string`

### Returns

The instantiated actor object

## setClass

Assign a class to the player

- Source: `packages/server/src/Player/ClassManager.ts`
- Kind: `method`
- Defined in: `IClassManager`

### Signature

```ts
setClass(_class: ClassClass | string): any
```

### Parameters

- `_class`: `ClassClass | string`

### Returns

The instantiated class object
