# Action Battle System

Advanced real-time action combat AI system for RPGJS.

The AI controller manages **behavior only** - all stats (HP, ATK, skills, items, etc.) are configured using the standard RPGJS API.

## Features

- **State Machine AI**: Enemies with dynamic behaviors (Idle, Alert, Combat, Flee, Stunned)
- **Multiple Enemy Types**: Aggressive, Defensive, Ranged, Tank, Berserker
- **Attack Patterns**: Melee, Combo, Charged, Zone, Dash Attack
- **Skill Support**: AI can use any RPGJS skill
- **Dodge System**: Enemies can dodge and counter-attack
- **Group Behavior**: Enemies coordinate attacks and formations
- **Patrol System**: Waypoint-based patrolling

## Installation

```bash
npm install @rpgjs/action-battle
```

## Quick Start

```typescript
import { createServer, RpgPlayer, RpgEvent, EventMode, ATK, PDEF, MAXHP } from "@rpgjs/server";
import { provideActionBattle, BattleAi, EnemyType } from "@rpgjs/action-battle/server";

function GoblinEnemy() {
  return {
    name: "Goblin",
    mode: EventMode.Scenario,
    onInit() {
      this.setGraphic("goblin");
      
      // Configure stats using RPGJS API
      this.hp = 80;
      this.param[MAXHP] = 80;
      this.param[ATK] = 15;
      this.param[PDEF] = 5;
      
      // Optional: Give skills
      // this.learnSkill(Slash);
      
      // Optional: Give items
      // this.addItem(Potion, 2);
      
      // Apply AI behavior
      new BattleAi(this, {
        enemyType: EnemyType.Aggressive
      });
    }
  };
}
```

## Using RPGJS API for Stats

The AI uses the event's existing stats. Configure them in `onInit`:

### Health & Resources

```typescript
this.hp = 100;           // Current HP
this.param[MAXHP] = 100; // Max HP
this.sp = 50;            // SP for skills
this.param[MAXSP] = 50;  // Max SP
```

### Parameters

```typescript
import { ATK, PDEF, SDEF } from "@rpgjs/server";

this.param[ATK] = 20;   // Attack power
this.param[PDEF] = 10;  // Physical defense
this.param[SDEF] = 8;   // Special defense
```

### Skills

```typescript
import { Fireball, Heal } from './database/skills';

this.learnSkill(Fireball);
this.learnSkill(Heal);
```

### Items & Equipment

```typescript
import { Sword, Shield, Potion } from './database/items';

this.addItem(Potion, 3);
this.equip(Sword);
this.equip(Shield);
```

### Classes

```typescript
import { WarriorClass } from './database/classes';

this.setClass(WarriorClass);
```

### States

```typescript
import { PoisonState } from './database/states';

this.addState(PoisonState);
```

## AI Configuration

The AI only controls **behavior**. All options are optional:

```typescript
new BattleAi(event, {
  // Enemy type (affects behavior, not stats)
  enemyType: EnemyType.Aggressive,
  
  // Skill to use for attacks (optional)
  attackSkill: Fireball,
  
  // Timing
  attackCooldown: 1000,  // ms between attacks
  
  // Ranges
  visionRange: 150,      // Detection radius
  attackRange: 60,       // Attack distance
  
  // Dodge behavior
  dodgeChance: 0.2,      // 0-1 probability
  dodgeCooldown: 2000,   // ms between dodges
  
  // Flee behavior
  fleeThreshold: 0.2,    // Flee when HP < 20%
  
  // Attack patterns
  attackPatterns: [
    AttackPattern.Melee,
    AttackPattern.Combo,
    AttackPattern.DashAttack
  ],
  
  // Patrol waypoints (for idle state)
  patrolWaypoints: [
    { x: 100, y: 100 },
    { x: 300, y: 100 }
  ],
  
  // Group coordination
  groupBehavior: true
});
```

## Enemy Types

Types modify AI **behavior** (cooldowns, ranges, dodge), not stats:

| Type | Attack Speed | Dodge | Behavior |
|------|-------------|-------|----------|
| **Aggressive** | Fast | Low | Rushes player |
| **Defensive** | Slow | High | Counter-attacks |
| **Ranged** | Medium | Medium | Keeps distance |
| **Tank** | Slow | None | Stands ground |
| **Berserker** | Variable | Low | Faster when hurt |

## Using Skills for Attacks

The AI can use any RPGJS skill:

```typescript
// In your database/skills.ts
import { Skill } from '@rpgjs/database';

@Skill({
  name: 'Slash',
  spCost: 5,
  power: 25,
  hitRate: 0.95
})
export class Slash {}

// In your event
onInit() {
  this.hp = 100;
  this.sp = 50;
  this.learnSkill(Slash);
  
  new BattleAi(this, {
    attackSkill: Slash
  });
}
```

## AI States

```
┌─────────┐     detect      ┌─────────┐    approach    ┌─────────┐
│  Idle   │ ──────────────> │  Alert  │ ─────────────> │ Combat  │
└─────────┘                 └─────────┘                └─────────┘
     ^                                                      │
     │                                                      │
     │              ┌─────────┐                            │
     │              │ Stunned │ <────── take damage ───────┤
     │              └─────────┘                            │
     │                   │                                  │
     │                   v                                  │
     │              ┌─────────┐                            │
     └───────────── │  Flee   │ <────── HP low ────────────┘
                    └─────────┘
```

## Attack Patterns

| Pattern | Description |
|---------|-------------|
| **Melee** | Single attack |
| **Combo** | 2-3 rapid attacks |
| **Charged** | Wind-up, stronger attack |
| **Zone** | 360° area attack |
| **DashAttack** | Rush toward target then attack |

## Examples

### Basic Enemy

```typescript
function Goblin() {
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

### Mage with Skills

```typescript
function DarkMage() {
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
      this.learnSkill(IceSpike);
      
      new BattleAi(this, {
        enemyType: EnemyType.Ranged,
        attackSkill: Fireball,
        visionRange: 200
      });
    }
  };
}
```

### Boss

```typescript
function DragonBoss() {
  return {
    name: "Dragon",
    onInit() {
      this.setGraphic("dragon");
      this.hp = 500;
      this.param[MAXHP] = 500;
      this.param[ATK] = 50;
      this.param[PDEF] = 30;
      
      this.learnSkill(FireBreath);
      this.learnSkill(TailSwipe);
      
      new BattleAi(this, {
        enemyType: EnemyType.Tank,
        attackSkill: FireBreath,
        attackPatterns: [
          AttackPattern.Melee,
          AttackPattern.Zone,
          AttackPattern.Charged
        ],
        fleeThreshold: 0.1,
        visionRange: 250
      });
    }
  };
}
```

### Patrol Guard

```typescript
function PatrolGuard() {
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

### Wolf Pack (Group)

```typescript
function Wolf() {
  return {
    name: "Wolf",
    onInit() {
      this.setGraphic("wolf");
      this.hp = 40;
      this.param[MAXHP] = 40;
      this.param[ATK] = 12;
      
      new BattleAi(this, {
        enemyType: EnemyType.Aggressive,
        groupBehavior: true,
        attackPatterns: [
          AttackPattern.Melee,
          AttackPattern.Combo
        ]
      });
    }
  };
}
```

## API Reference

### BattleAi Methods

```typescript
// Get current health (uses event.hp)
ai.getHealth(): number

// Get max health (uses event.param[MAXHP])
ai.getMaxHealth(): number

// Get current target
ai.getTarget(): RpgPlayer | null

// Get current AI state
ai.getState(): AiState

// Get enemy type
ai.getEnemyType(): EnemyType

// Handle damage (called automatically)
ai.takeDamage(attacker: RpgPlayer): boolean

// Clean up AI instance
ai.destroy(): void
```

## Player Combat

The module handles player attacks via the `action` input:

```typescript
// Player presses action key -> attack animation + hitbox
// Hitbox detects enemy -> enemy.battleAi.takeDamage(player)
// Damage uses RPGJS formula: target.applyDamage(attacker)
```

## Visual Feedback

Automatic feedback:

- **Flash Effect**: Red flash when taking damage
- **Damage Numbers**: Floating damage text
- **Attack Animation**: Triggers `attack` animation
- **Knockback**: Enemies pushed back on hit
