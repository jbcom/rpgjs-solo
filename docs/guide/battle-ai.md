---
title: "Action Battle System"
description: "Use the real-time action battle AI system for RPGJS enemies."
---

# Action Battle System

Advanced real-time action combat AI system for RPGJS.

The AI controller manages **behavior only**. All stats, HP, SP, skills, items, classes, and states are configured with the standard RPGJS API.

## Features

- State machine AI with `Idle`, `Alert`, `Combat`, `Flee`, and `Stunned`
- Multiple enemy types: `Aggressive`, `Defensive`, `Ranged`, `Tank`, `Berserker`
- Attack patterns: `Melee`, `Combo`, `Charged`, `Zone`, `DashAttack`
- Skill support with standard RPGJS skills
- Dodge and counter-attack behaviors
- Group behavior and waypoint patrols
- Knockback driven by weapon configuration
- Hook system with `onBeforeHit` and `onAfterHit`

## Installation

```bash
npm install @rpgjs/action-battle
```

## Quick Start

```ts
import { EventMode, ATK, PDEF, MAXHP, type EventDefinition } from "@rpgjs/server";
import { provideActionBattle, BattleAi, EnemyType } from "@rpgjs/action-battle/server";

function GoblinEnemy(): EventDefinition {
  return {
    name: "Goblin",
    mode: EventMode.Scenario,
    onInit() {
      this.setGraphic("goblin");

      this.hp = 80;
      this.param[MAXHP] = 80;
      this.param[ATK] = 15;
      this.param[PDEF] = 5;

      new BattleAi(this, {
        enemyType: EnemyType.Aggressive
      });
    }
  };
}
```

When you build an object-based event for a map, type the factory as `EventDefinition`.
The returned object only describes the event behavior. Placement data such as `id`, `x`, and `y`
still belongs to the outer `maps[].events` wrapper.

## Enable the module

Register the module on the server:

```ts
import { createServer } from "@rpgjs/server";
import { provideActionBattle } from "@rpgjs/action-battle/server";

export default createServer({
  providers: [
    provideActionBattle({
      animations: {
        attack: "attack"
      }
    })
  ]
});
```

`animations` is optional. If you omit it, attacks keep using the default
`attack` animation and no extra hurt, death, or skill-cast animation is played.

Player attacks lock movement for `350ms` by default. This gives an A-RPG feel
where the hero performs the attack in place before moving again.

```ts
provideActionBattle({
  attack: {
    lockMovement: true,
    lockDurationMs: 350
  }
});
```

Set `lockMovement` to `false` if you want players to keep moving while
attacking.

## Plugin-first extension points

Action battle is structured as replaceable systems. You can keep the default
Zelda-like sword attack and only replace the pieces your game needs.

```ts
import { provideActionBattle } from "@rpgjs/action-battle/server";

export default provideActionBattle({
  attack: {
    lockMovement: true,
    lockDurationMs: 280,
    hitboxes: {
      right: { offsetX: 18, offsetY: -18, width: 42, height: 36 }
    }
  },
  systems: {
    combat: {
      damage({ attacker, target, skill }) {
        const raw = target.applyDamage(attacker, skill);
        return {
          damage: raw.damage,
          defeated: target.hp <= 0,
          raw
        };
      },
      hooks: {
        beforeHit(context) {
          return context;
        },
        afterHit(result) {
          console.log(`Damage: ${result.damage}`);
        }
      }
    },
    ai: {
      behaviors: {
        slime({ hpPercent }) {
          return {
            mode: hpPercent !== null && hpPercent < 0.25 ? "retreat" : "assault",
            attackCooldown: 900
          };
        }
      }
    }
  }
});
```

The public extension contracts are exported from `@rpgjs/action-battle/server`:
`ActionBattleCombatSystem`, `ActionBattleAiBehavior`,
`ActionBattleHitHooks`, and `ActionBattleHitResult`.

For data-driven enemies, use `createActionEnemy()`:

```ts
import { createActionEnemy, EnemyType } from "@rpgjs/action-battle/server";

const enemyPresets = {
  slime: {
    enemyType: EnemyType.Aggressive,
    behaviorKey: "slime",
    stats(event) {
      event.hp = 40;
    }
  }
};

createActionEnemy(this, "slime", enemyPresets);
```

When the action targets a normal event with no `BattleAi`, action-battle lets
the event handle `onAction` without playing the player attack animation. Enemy
events with `BattleAi` still trigger the A-RPG attack.

## Configure stats with the standard RPGJS API

The AI uses the event's existing data.

### Health and resources

```ts
this.hp = 100;
this.param[MAXHP] = 100;
this.sp = 50;
this.param[MAXSP] = 50;
```

### Parameters

```ts
import { ATK, PDEF, SDEF } from "@rpgjs/server";

this.param[ATK] = 20;
this.param[PDEF] = 10;
this.param[SDEF] = 8;
```

### Skills

```ts
import { Fireball, Heal } from "./database/skills";

this.learnSkill(Fireball);
this.learnSkill(Heal);
```

### Items and equipment

```ts
import { Sword, Shield, Potion } from "./database/items";

this.addItem(Potion, 3);
this.equip(Sword);
this.equip(Shield);
```

### Classes

```ts
import { WarriorClass } from "./database/classes";

this.setClass(WarriorClass);
```

### States

```ts
import { PoisonState } from "./database/states";

this.addState(PoisonState);
```

## AI configuration

All AI options are optional:

```ts
new BattleAi(event, {
  enemyType: EnemyType.Aggressive,
  attackSkill: Fireball,
  attackCooldown: 1000,
  visionRange: 150,
  attackRange: 60,
  dodgeChance: 0.2,
  dodgeCooldown: 2000,
  fleeThreshold: 0.2,
  attackPatterns: [
    AttackPattern.Melee,
    AttackPattern.Combo,
    AttackPattern.DashAttack
  ],
  patrolWaypoints: [
    { x: 100, y: 100 },
    { x: 300, y: 100 }
  ],
  groupBehavior: true,
  animations: {
    attack: {
      animationName: "walk",
      graphic: "goblin_attack",
      repeat: 1
    },
    hurt: {
      animationName: "walk",
      graphic: "goblin_hurt",
      repeat: 1
    },
    die: {
      animationName: "walk",
      graphic: "goblin_die",
      repeat: 1,
      delayMs: 700
    }
  },
  onDefeated: (event, attacker) => {
    const name = attacker?.name?.() ?? "Unknown";
    console.log(`${event.name()} was defeated by ${name}!`);
  }
});
```

Per-enemy `animations` override the global `provideActionBattle()` animations.
Use a string for a simple animation name, an object to temporarily switch
graphics, or a resolver function for data-driven events. Return `null` or
`undefined` from a resolver to skip the animation.

When combat spritesheets come from RPGJS Studio media fields, convert the media
ids with `createStudioActionBattleAnimations()`. Studio-generated combat
spritesheets are played with `setGraphicAnimation("attack", graphic, 1)` by
default:

```ts
import { provideActionBattle } from "@rpgjs/action-battle/server";
import { createStudioActionBattleAnimations } from "@rpgjs/studio/server";

export default provideActionBattle({
  animations: createStudioActionBattleAnimations()
});
```

Without arguments, the helper reads the Studio project animations attached to
the player at runtime by `provideStudioGame()`. You can still pass a static
object when you want to override the media ids manually. Animation values may be
media ids or media objects returned by the Studio game API.

For Studio enemies, the runtime reads `enemy.animations` automatically when an
enemy is created from the Studio database. The supported Studio fields are
`attack`, `hurt`, `die`, and `castSpell`. `castSkill` is also accepted when you
configure action-battle directly.

## Enemy types

Enemy types affect behavior, not stats:

| Type | Attack Speed | Dodge | Behavior |
|---|---|---|---|
| Aggressive | Fast | Low | Rushes player |
| Defensive | Slow | High | Counter-attacks |
| Ranged | Medium | Medium | Keeps distance |
| Tank | Slow | None | Stands ground |
| Berserker | Variable | Low | Faster when hurt |

## Attack patterns

| Pattern | Description |
|---|---|
| Melee | Single attack |
| Combo | 2-3 rapid attacks |
| Charged | Wind-up, stronger attack |
| Zone | 360° area attack |
| DashAttack | Rush toward target then attack |

## Use skills for attacks

```ts
import { Skill } from "@rpgjs/database";

@Skill({
  name: "Slash",
  spCost: 5,
  power: 25,
  hitRate: 0.95
})
export class Slash {}

onInit() {
  this.hp = 100;
  this.sp = 50;
  this.learnSkill(Slash);

  new BattleAi(this, {
    attackSkill: Slash
  });
}
```

## Examples

### Basic enemy

```ts
import { type EventDefinition, ATK, MAXHP } from "@rpgjs/server";

function Goblin(): EventDefinition {
  return {
    name: "Goblin",
    onInit() {
      this.setGraphic("goblin");
      this.hp = 50;
      this.param[MAXHP] = 50;
      this.param[ATK] = 10;

      new BattleAi(this);
    }
  };
}
```

### Mage with skills

```ts
import { ATK, MAXHP, MAXSP, type EventDefinition } from "@rpgjs/server";

function DarkMage(): EventDefinition {
  return {
    name: "Dark Mage",
    onInit() {
      this.setGraphic("mage");
      this.hp = 60;
      this.sp = 100;
      this.param[MAXHP] = 60;
      this.param[MAXSP] = 100;
      this.param[ATK] = 25;

      this.learnSkill(Fireball);

      new BattleAi(this, {
        enemyType: EnemyType.Ranged,
        attackSkill: Fireball,
        visionRange: 200
      });
    }
  };
}
```

### Patrol guard

```ts
import { ATK, MAXHP, type EventDefinition } from "@rpgjs/server";

function PatrolGuard(): EventDefinition {
  return {
    name: "Guard",
    onInit() {
      this.setGraphic("guard");
      this.hp = 80;
      this.param[MAXHP] = 80;
      this.param[ATK] = 15;

      new BattleAi(this, {
        enemyType: EnemyType.Defensive,
        patrolWaypoints: [
          { x: 100, y: 150 },
          { x: 300, y: 150 },
          { x: 300, y: 350 },
          { x: 100, y: 350 }
        ]
      });
    }
  };
}
```

## Player combat

The module handles player attacks via the `action` input:

```ts
// Player presses action key -> attack animation + hitbox
// Hitbox detects enemy -> applyPlayerHitToEvent(player, event)
// Damage uses RPGJS formula: target.applyDamage(attacker)
```

## Knockback system

Knockback force is driven by the equipped weapon's `knockbackForce` property:

```ts
const Warhammer = {
  id: "warhammer",
  name: "War Hammer",
  atk: 30,
  knockbackForce: 100,
  _type: "weapon" as const
};
```

## Reference source

This guide is based on the package documentation in [packages/action-battle/README.md](/home/samuel/www/RPG-JS/packages/action-battle/README.md).
