# @jbcom/rpgjs-solo-action-battle

Deterministic, transport-free action combat for RPGJS Solo. It adapts RPGJS
v5's attack-profile and hit-policy vocabulary to the Solo fixed-tick runtime;
it does not import the upstream server, client, rooms, projectiles, timers, or
AI runtime.

The package owns combat execution, not combat decisions. Human input, replay,
and Yuka governors all dispatch the same public `combat:use` and
`combat:guard` actions. Startup, active, recovery, cooldown, resource,
targeting, guard, projectile, status, damage, and defeat state lives on the
authoritative Solo entities and therefore participates in normal snapshots.

```ts
import { SoloRuntime } from '@jbcom/rpgjs-solo'
import { SoloActionBattle } from '@jbcom/rpgjs-solo-action-battle'

const runtime = new SoloRuntime()
const combat = new SoloActionBattle(runtime)

combat.registerAction({
  id: 'knight-slash',
  name: 'Crown Slash',
  mode: 'melee',
  range: 42,
  arcDegrees: 110,
  damage: { powerScale: 1.1 },
  profile: { startupTicks: 5, activeTicks: 4, recoveryTicks: 11 }
})

combat.registerCombatant('hero', {
  faction: 'crown',
  actions: ['knight-slash'],
  power: 18,
  guard: { damageReduction: 0.7 }
})

runtime.dispatch({
  type: 'action',
  entityId: 'hero',
  action: 'combat:use',
  payload: { actionId: 'knight-slash', targetId: 'slime' },
  source: 'human'
})
```

Game-authored class kits, enemy tuning, encounter eligibility, rewards, and
story consequences remain in the game. The reusable fixed-tick mechanics and
telemetry remain here.
