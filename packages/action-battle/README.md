# Action Battle System

Advanced real-time action combat AI system for RPGJS.

The AI controller manages **behavior only** - all stats (HP, ATK, skills, items, etc.) are configured using the standard RPGJS API.

## Features

- **State Machine AI**: Enemies with dynamic behaviors (Idle, Alert, Combat, Flee, Stunned)
- **Plugin-first architecture**: Replace damage, hitboxes, knockback, hooks, and AI behaviors independently
- **Multiple Enemy Types**: Aggressive, Defensive, Ranged, Tank, Berserker
- **Attack Patterns**: Melee, Combo, Charged, Zone, Dash Attack
- **Skill Support**: AI can use any RPGJS skill
- **Dodge System**: Enemies can dodge and counter-attack
- **Group Behavior**: Enemies coordinate attacks and formations
- **Patrol System**: Waypoint-based patrolling
- **Knockback System**: Weapon-based knockback force
- **Hook System**: Customize hit behavior with `onBeforeHit` and `onAfterHit` hooks

## Installation

```bash
npm install @rpgjs/action-battle
```

## Plugin-First Customization

`provideActionBattle()` ships with Zelda-like defaults, but each combat system
can be replaced without rewriting the module.

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
      knockback({ attacker, target }) {
        const dx = target.x() - attacker.x();
        const dy = target.y() - attacker.y();
        const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        return {
          force: 70,
          duration: 220,
          direction: { x: dx / distance, y: dy / distance }
        };
      },
      hooks: {
        beforeHit(context) {
          // Return false to cancel a hit, or return a modified context.
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

The main extension contracts are:

- `ActionBattleCombatSystem`: resolves hitboxes, damage, knockback, and hooks.
- `ActionBattleAiBehavior`: returns lightweight AI decisions from event state.
- `ActionBattleHitHooks`: `beforeHit`, `afterDamage`, and `afterHit`.

Use `createActionEnemy()` when you want data-driven enemy presets:

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
  groupBehavior: true,
  
  // Callback when AI is defeated
  onDefeated: (event, attacker) => {
    const name = attacker?.name?.() ?? "Unknown";
    console.log(`${event.name()} was defeated by ${name}!`);
  }
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

### Complete Example with Weapons

```typescript
import { createServer, RpgPlayer, RpgMap, EventMode, MAXHP, ATK, PDEF } from "@rpgjs/server";
import { provideActionBattle, BattleAi, EnemyType } from "@rpgjs/action-battle/server";

// Define weapons with knockback
const IronSword = {
  id: 'iron-sword',
  name: 'Iron Sword',
  description: 'A reliable iron sword',
  atk: 15,
  knockbackForce: 40,
  _type: 'weapon' as const,
};

const GiantMaul = {
  id: 'giant-maul',
  name: 'Giant Maul',
  description: 'Massive hammer with devastating knockback',
  atk: 30,
  knockbackForce: 100,
  _type: 'weapon' as const,
};

const GoblinDagger = {
  id: 'goblin-dagger',
  name: 'Goblin Dagger',
  description: 'Small rusty dagger',
  atk: 8,
  knockbackForce: 20,
  _type: 'weapon' as const,
};

// Enemy with weapon
function GoblinWarrior() {
  return {
    name: "Goblin Warrior",
    mode: EventMode.Scenario,
    onInit() {
      this.setGraphic("goblin");
      
      // Stats
      this.hp = 60;
      this.param[MAXHP] = 60;
      this.param[ATK] = 12;
      this.param[PDEF] = 5;
      
      // Equip weapon (knockbackForce: 20)
      this.addItem(GoblinDagger);
      this.equip(GoblinDagger.id);
      
      // AI
      new BattleAi(this, {
        enemyType: EnemyType.Aggressive,
        attackRange: 45
      });
    }
  };
}

// Server setup
export default createServer({
  providers: [
    provideActionBattle(),
    {
      database: {
        'iron-sword': IronSword,
        'giant-maul': GiantMaul,
        'goblin-dagger': GoblinDagger
      },
      player: {
        onJoinMap(player: RpgPlayer, map: RpgMap) {
          // Setup player stats
          player.hp = 100;
          player.param[MAXHP] = 100;
          player.param[ATK] = 15;
          
          // Give player a weapon with high knockback
          player.addItem(GiantMaul);
          player.equip(GiantMaul.id);
          
          // Player attacks will now knock enemies back with force 100
        }
      },
      maps: [
        {
          id: 'battle-map',
          events: [{ event: GoblinWarrior() }]
        }
      ]
    }
  ]
});
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
// Hitbox detects enemy -> applyPlayerHitToEvent(player, event)
// Damage uses RPGJS formula: target.applyDamage(attacker)
// Knockback force is based on equipped weapon's knockbackForce property
```

By default, the player is locked in place for `350ms` when attacking, similar
to classic A-RPG combat where the attack resolves before movement resumes.

```ts
provideActionBattle({
  attack: {
    lockMovement: true,
    lockDurationMs: 350
  }
});
```

Set `lockMovement` to `false` if your game should allow moving attacks.

When the action targets a normal event with no `BattleAi`, action-battle lets
the event handle `onAction` without playing the player attack animation. Enemy
events with `BattleAi` still trigger the A-RPG attack.

## Configurable Combat Animations

By default, player and AI attacks keep using the existing `attack` animation:

```ts
player.setGraphicAnimation("attack", 1);
```

Use `animations` when your combat sprites are stored in separate graphics such
as `hero_attack`, `hero_hurt`, or `hero_die`.

```ts
import { provideActionBattle } from "@rpgjs/action-battle/server";

export default provideActionBattle({
  animations: {
    attack: "attack",
    hurt: "hurt",
    die: {
      animationName: "die",
      repeat: 1,
      delayMs: 500
    },
    castSkill: "skill"
  }
});
```

RPGJS Studio stores combat animations as spritesheet media ids. If
`provideStudioGame()` is installed, `createStudioActionBattleAnimations()` can
read the project animations attached to the player at runtime. By default, the
helper plays Studio attack spritesheets with
`setGraphicAnimation("attack", graphic, 1)`:

```ts
import { provideActionBattle } from "@rpgjs/action-battle/server";
import { createStudioActionBattleAnimations } from "@rpgjs/studio/server";

export default provideActionBattle({
  animations: createStudioActionBattleAnimations()
});
```

You can also pass a static Studio animation object to override the media ids
manually. Animation values may be media ids or media objects returned by the
Studio game API.

The Studio field `castSpell` is accepted as an alias for action-battle's
`castSkill` animation key.

For data-driven spritesheets, use resolver functions:

```ts
provideActionBattle({
  animations: {
    attack: (entity) => ({
      animationName: "walk",
      graphic: entity.combatAnimations?.attack,
      repeat: 1
    }),
    hurt: (entity) => ({
      animationName: "walk",
      graphic: entity.combatAnimations?.hurt,
      repeat: 1
    }),
    die: (entity) => ({
      animationName: "walk",
      graphic: entity.combatAnimations?.die,
      repeat: 1,
      waitEnd: true
    }),
    castSkill: (entity, context) => ({
      animationName: "walk",
      graphic: entity.combatAnimations?.castSkill,
      repeat: 1
    })
  }
});
```

When `graphic` is provided, action-battle calls:

```ts
entity.setGraphicAnimation(animationName, graphic, repeat);
```

Otherwise it calls:

```ts
entity.setGraphicAnimation(animationName, repeat);
```

Return `null` or `undefined` from a resolver to skip the animation. `BattleAi`
can also override the global configuration per enemy:

```ts
new BattleAi(this, {
  animations: {
    attack: {
      animationName: "walk",
      graphic: "slime_attack",
      repeat: 1
    },
    die: {
      animationName: "walk",
      graphic: "slime_die",
      repeat: 1,
      delayMs: 700
    }
  }
});
```

`waitEnd: true` delays event removal for defeated AI with the default delay used
by action-battle. Use `delayMs` when you need an exact duration.

## Knockback System

Knockback force is determined by the equipped weapon's `knockbackForce` property.

### Creating Weapons with Knockback

```typescript
// Light weapon - low knockback
const Dagger = {
  id: 'dagger',
  name: 'Iron Dagger',
  atk: 10,
  knockbackForce: 20,
  _type: 'weapon' as const,
};

// Heavy weapon - high knockback
const Warhammer = {
  id: 'warhammer',
  name: 'War Hammer',
  atk: 30,
  knockbackForce: 100,
  _type: 'weapon' as const,
};
```

### Default Knockback

If no weapon is equipped or the weapon doesn't have `knockbackForce`, the default value is used:

```typescript
import { DEFAULT_KNOCKBACK } from "@rpgjs/action-battle/server";

console.log(DEFAULT_KNOCKBACK.force);    // 50
console.log(DEFAULT_KNOCKBACK.duration); // 300ms
```

## Hook System

Customize hit behavior using hooks. Available on both player-to-enemy and enemy-to-player hits.

### HitResult Interface

```typescript
interface HitResult {
  damage: number;           // Damage dealt
  knockbackForce: number;   // Knockback force (from weapon)
  knockbackDuration: number; // Knockback duration in ms
  defeated: boolean;        // Whether target was defeated
  attacker: RpgPlayer | RpgEvent;
  target: RpgPlayer | RpgEvent;
}
```

### Using Hooks with applyPlayerHitToEvent

```typescript
import { applyPlayerHitToEvent } from "@rpgjs/action-battle/server";

// In your custom attack handler
const result = applyPlayerHitToEvent(player, event, {
  onBeforeHit(hitResult) {
    // Modify knockback for armored enemies
    if ((hitResult.target as any).hasState?.('armored')) {
      hitResult.knockbackForce *= 0.5;
    }
    
    // Critical hit - double knockback
    if (Math.random() < 0.1) {
      hitResult.knockbackForce *= 2;
      console.log('Critical hit!');
    }
    
    return hitResult; // Must return modified result
  },
  
  onAfterHit(hitResult) {
    // Award gold on kill
    if (hitResult.defeated) {
      (hitResult.attacker as any).gold += 10;
    }
    
    // Apply poison on hit (30% chance)
    if (Math.random() < 0.3) {
      (hitResult.target as any).addState?.('poison');
    }
    
    // Play custom sound
    playSound('hit');
  }
});
```

### Custom Attack Implementation

Override the default attack to add custom hooks:

```typescript
import { 
  applyPlayerHitToEvent, 
  DEFAULT_PLAYER_ATTACK_HITBOXES,
  getPlayerWeaponKnockbackForce 
} from "@rpgjs/action-battle/server";

// Custom attack with hooks
function customAttack(player: RpgPlayer) {
  player.setGraphicAnimation('attack', 1);
  
  const direction = player.getDirection();
  const hitboxConfig = DEFAULT_PLAYER_ATTACK_HITBOXES[direction] || DEFAULT_PLAYER_ATTACK_HITBOXES.default;
  
  const hitboxes = [{
    x: player.x() + hitboxConfig.offsetX,
    y: player.y() + hitboxConfig.offsetY,
    width: hitboxConfig.width,
    height: hitboxConfig.height
  }];

  const map = player.getCurrentMap();
  map?.createMovingHitbox(hitboxes, { speed: 3 }).subscribe({
    next(hits) {
      hits.forEach((hit) => {
        if (hit instanceof RpgEvent) {
          applyPlayerHitToEvent(player, hit, {
            onBeforeHit(result) {
              // Custom modifications
              return result;
            },
            onAfterHit(result) {
              // Custom effects
            }
          });
        }
      });
    }
  });
}
```

### Getting Weapon Knockback Force

```typescript
import { getPlayerWeaponKnockbackForce } from "@rpgjs/action-battle/server";

const force = getPlayerWeaponKnockbackForce(player);
console.log(`Player knockback force: ${force}`);
```

## onDefeated Hook

The `onDefeated` callback is triggered when an AI enemy is killed. It receives the defeated event and the player who landed the killing blow (if available). Use it to:
- Award experience, gold, or items to the player
- Spawn loot drops
- Trigger events or cutscenes
- Update quest progress
- Play death animations or sounds

### Basic Usage

```typescript
new BattleAi(this, {
  enemyType: EnemyType.Aggressive,
  onDefeated: (event, attacker) => {
    const name = attacker?.name?.() ?? "Unknown";
    console.log(`${event.name()} was defeated by ${name}!`);
  }
});
```

### Award Rewards on Kill

```typescript
function Goblin() {
  return {
    name: "Goblin",
    onInit() {
      this.setGraphic("goblin");
      this.hp = 50;
      this.param[MAXHP] = 50;
      this.param[ATK] = 10;
      
      new BattleAi(this, {
        enemyType: EnemyType.Aggressive,
        onDefeated: (event, attacker) => {
          if (!attacker) return;

          // Award gold
          attacker.gold += 25;
          
          // Award experience
          attacker.exp += 50;
          
          // Random loot drop
          if (Math.random() < 0.3) {
            attacker.addItem(HealthPotion);
          }
        }
      });
    }
  };
}
```

### Spawn Loot on Death

```typescript
new BattleAi(this, {
  onDefeated: (event, attacker) => {
    const map = event.getCurrentMap();
    if (!map) return;
    
    // Spawn loot at enemy position
    map.createDynamicEvent({
      x: event.x(),
      y: event.y(),
      event: LootChest({ items: [GoldCoin, HealthPotion] })
    });
  }
});
```

### Track Kill Count

```typescript
let killCount = 0;

new BattleAi(this, {
  onDefeated: (event, attacker) => {
    killCount++;
    
    // Check quest progress
    if (killCount >= 10) {
      triggerQuestComplete('slay_goblins');
    }
  }
});
```

### Boss Death Event

```typescript
function DragonBoss() {
  return {
    name: "Ancient Dragon",
    onInit() {
      this.setGraphic("dragon");
      this.hp = 1000;
      this.param[MAXHP] = 1000;
      
      new BattleAi(this, {
        enemyType: EnemyType.Tank,
        onDefeated: (event, attacker) => {
          const map = event.getCurrentMap();
          
          // Announce victory
          map?.getPlayersIn()?.forEach(player => {
            player.showNotification({
              message: "The Ancient Dragon has been slain!",
              time: 5000
            });
            
            // Reward all participants
            player.gold += 1000;
            player.exp += 5000;
            player.addItem(DragonScale);
          });
          
          // Open dungeon exit
          map?.setTileProperty(exitX, exitY, { passable: true });
        }
      });
    }
  };
}
```

## Visual Feedback

Automatic feedback:

- **Flash Effect**: Red flash when taking damage
- **Damage Numbers**: Floating damage text
- **Attack Animation**: Triggers `attack` animation
- **Knockback**: Entities pushed back based on weapon `knockbackForce`

## Action Bar + AoE Targeting (client + server)

The action-battle package includes optional GUI components for an A-RPG action bar
and AoE skill targeting. They are disabled by default and are configured via
`provideActionBattle()`.

### Enable the Action Bar

```ts
import { provideActionBattle } from "@rpgjs/action-battle";

export default provideActionBattle({
  ui: {
    actionBar: {
      enabled: true,
      autoOpen: true,
      mode: "both" // "items" | "skills" | "both"
    }
  }
});
```

You can open/close it manually on the server:

```ts
import { openActionBattleActionBar } from "@rpgjs/action-battle/server";

openActionBattleActionBar(player);
```

### Skill Range + AoE Mask (ASCII)

Define range and AoE mask on the skill data (custom fields). The range uses
Manhattan distance, and the mask is centered on the target tile.

```ts
@Skill({
  name: "Nova",
  spCost: 12,
  // Custom fields used by action-battle
  range: 3,
  aoeMask: [
    ".#.",
    "###",
    ".#."
  ]
})
export class Nova {}
```

### Targeting Options

```ts
export default provideActionBattle({
  ui: {
    actionBar: {
      enabled: true,
      autoOpen: false
    },
    targeting: {
      enabled: true,
      showGrid: true,
      colors: {
        area: 0x2f9ef7,
        edge: 0x1b6a98,
        cursor: 0xffd166
      }
    }
  },
  targeting: {
    affects: "events", // "events" | "players" | "both"
    allowEmptyTarget: true
  }
});
```

### Custom Targeting Resolver (optional)

If you prefer to compute targeting from your own skill schema, use `getTargeting`:

```ts
export default provideActionBattle({
  skills: {
    getTargeting(skill) {
      return skill?.targeting;
    }
  }
});
```
