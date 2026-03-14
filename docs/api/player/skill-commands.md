---
title: "Skill Commands"
description: "Learn, forget, and use skills from the server-side player API."
---

# Skill Commands

Learn, forget, and use skills from the server-side player API.

## Members

- [forgetSkill](#forgetskill)
- [getSkill](#getskill)
- [learnSkill](#learnskill)
- [useSkill](#useskill)

## forgetSkill

Forget a skill

- Source: `packages/server/src/Player/SkillManager.ts`
- Kind: `method`
- Defined in: `ISkillManager`

### Signature

```ts
forgetSkill(skillInput: SkillClass | SkillObject | string): any
```

### Parameters

- `skillInput`: `SkillClass | SkillObject | string`

### Returns

The forgotten skill data

## getSkill

Retrieves a learned skill. Returns null if not found

- Source: `packages/server/src/Player/SkillManager.ts`
- Kind: `method`
- Defined in: `ISkillManager`

### Signature

```ts
getSkill(skillInput: SkillClass | SkillObject | string): any | null
```

### Parameters

- `skillInput`: `SkillClass | SkillObject | string`

### Returns

The skill data or null

## learnSkill

Learn a skill

Supports three input formats:
- String ID: Retrieves from database
- Class: Creates instance and adds to database
- Object: Uses directly and adds to database

- Source: `packages/server/src/Player/SkillManager.ts`
- Kind: `method`
- Defined in: `ISkillManager`

### Signature

```ts
learnSkill(skillInput: SkillClass | SkillObject | string): any
```

### Parameters

- `skillInput`: `SkillClass | SkillObject | string`

### Returns

The learned skill data

## useSkill

Use a skill

- Source: `packages/server/src/Player/SkillManager.ts`
- Kind: `method`
- Defined in: `ISkillManager`

### Signature

```ts
useSkill(skillInput: SkillClass | SkillObject | string, otherPlayer?: RpgPlayer | RpgPlayer[]): any
```

### Parameters

- `skillInput`: `SkillClass | SkillObject | string`
- `otherPlayer?`: `RpgPlayer | RpgPlayer[]`

### Returns

The used skill data
