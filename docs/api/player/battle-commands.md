---
title: "Battle Commands"
description: "Battle formulas and server-side battle helpers for players."
---

# Battle Commands

Battle formulas and server-side battle helpers for players.

## Members

- [applyDamage](#applydamage)

## applyDamage

Apply damage. Player will lose HP. the `attackerPlayer` parameter is the other player, the one who attacks.

If you don't set the skill parameter, it will be a physical attack.
The attack formula is already defined but you can customize it in the server options.
This method handles all aspects of damage calculation including critical hits,
elemental vulnerabilities, guard effects, and applies the final damage to HP.

- Source: `packages/server/src/Player/BattleManager.ts`
- Kind: `method`
- Defined in: `IBattleManager`

### Signature

```ts
applyDamage(attackerPlayer: RpgPlayer, skill?: any): {
    damage: number;
    critical: boolean;
    elementVulnerable: boolean;
    guard: boolean;
    superGuard: boolean;
  }
```

### Parameters

- `attackerPlayer`: `RpgPlayer`
- `skill?`: `any`

### Returns

Object containing damage details and special effects that occurred

### Examples

```ts
// Physical attack
const result = player.applyDamage(attackerPlayer);
console.log(`Physical damage: ${result.damage}, Critical: ${result.critical}`);

// Magical attack with skill
const fireSkill = { id: 'fire', power: 50, element: 'fire' };
const magicResult = player.applyDamage(attackerPlayer, fireSkill);
console.log(`Magic damage: ${magicResult.damage}, Vulnerable: ${magicResult.elementVulnerable}`);

// Check for guard effects
if (result.guard) {
  console.log('Attack was partially blocked!');
}
if (result.superGuard) {
  console.log('Attack was heavily reduced by super guard!');
}
```
