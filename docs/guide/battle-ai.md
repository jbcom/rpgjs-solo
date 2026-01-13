# Battle AI System

The RPGJS Battle AI system lets events behave like enemies: detect players, move, attack, and react to damage. This guide covers setup and usage with the current `BattleAi` API.

## Overview

What you get out of the box:

- Vision detection and target acquisition
- Pathing toward a target
- Automatic attacks (skills or hitboxes)
- Hit reactions (damage, knockback, death cleanup)
- Optional patrols and group behavior

## Enable the module

Register the action battle module in your server providers:

```ts
import { provideActionBattle } from "@rpgjs/action-battle/server";

export default createServer({
  providers: [
    provideActionBattle(),
  ]
});
```

This module wires the default player attack input and forwards vision hooks to AIs.

## Create an AI event

Attach `BattleAi` in your event `onInit`:

```ts
import { BattleAi, EnemyType, AttackPattern } from "@rpgjs/action-battle/server";
import { MAXHP, ATK, PDEF } from "@rpgjs/server";

export function Goblin() {
  return {
    name: "Goblin",
    onInit() {
      this.setGraphic("goblin");

      // Stats
      this.hp = 120;
      this.param[MAXHP] = 120;
      this.param[ATK] = 15;
      this.param[PDEF] = 6;

      // AI
      this.battleAi = new BattleAi(this, {
        enemyType: EnemyType.Aggressive,
        visionRange: 160,
        attackRange: 55,
        attackCooldown: 800,
        attackPatterns: [
          AttackPattern.Melee,
          AttackPattern.Combo,
          AttackPattern.DashAttack
        ]
      });
    }
  };
}
```

## BattleAi options

Use these options when creating the AI:

```ts
new BattleAi(event, {
  enemyType: EnemyType.Aggressive,
  visionRange: 150,
  attackRange: 50,
  attackCooldown: 900,
  dodgeChance: 0.3,
  dodgeCooldown: 2000,
  fleeThreshold: 0.2,
  attackSkill: FireSkill,
  attackPatterns: [
    AttackPattern.Melee,
    AttackPattern.Combo,
    AttackPattern.Charged
  ],
  patrolWaypoints: [{ x: 100, y: 120 }, { x: 160, y: 200 }],
  groupBehavior: true,
  moveToCooldown: 450,
  retreatCooldown: 700,
  behavior: {
    baseScore: 55,
    updateInterval: 450,
    minStateDuration: 700,
    assaultThreshold: 70,
    retreatThreshold: 30
  },
  onDefeated(event) {
    // drop loot, spawn effects, etc.
  }
});
```

### Notes on key options

- `enemyType`: Applies default tuning for aggressive/defensive/ranged/tank/berserker.
- `attackSkill`: If set, the AI uses this skill for melee/charged attacks; otherwise it uses hitboxes.
- `attackPatterns`: Restricts which patterns the AI can pick.
- `patrolWaypoints`: Enables patrol behavior while idle.
- `groupBehavior`: Makes nearby AIs form a loose ring around the target.
- `moveToCooldown` / `retreatCooldown`: Throttles `moveTo` and retreat dashes to avoid spam.
- `behavior`: Enables the behavior gauge (see below). If omitted, the AI uses the classic logic.

## Behavior gauge (optional)

When `behavior` is set, the AI uses a score from 0–100 to switch between:

- **assault**: closes distance and fights aggressively
- **tactical**: keeps an optimal range and repositions
- **retreat**: flees briefly, then may re-engage

The score is influenced by HP percentage, recent damage, distance to target, and nearby allies. Thresholds and timings are configurable via the `behavior` object.

## Player attacks vs AI

The module already provides a default player attack handler. If you want a custom hit flow, use `applyPlayerHitToEvent`:

```ts
import { applyPlayerHitToEvent } from "@rpgjs/action-battle/server";

const result = applyPlayerHitToEvent(player, event, {
  onBeforeHit(hit) {
    hit.knockbackForce *= 1.5;
    return hit;
  },
  onAfterHit(hit) {
    if (hit.defeated) {
      player.gold += 10;
    }
  }
});
```

## Debugging

Enable debug logs:

```ts
import { AiDebug } from "@rpgjs/action-battle/server";

AiDebug.enabled = true;
AiDebug.filterEventId = "goblin-1"; // optional
AiDebug.categories = ["state", "movement", "attack"];
```

## Example in the sample server

See `sample/src/server.ts` for a full example with `BattleAi` configuration.
