# @jbcom/rpgjs-solo

The transport-free, single-process runtime from RPGJS Solo. It is intentionally
prerelease while RPGJS v5 and the Solo compatibility surface stabilize.

```ts
import { SoloRuntime } from '@jbcom/rpgjs-solo'

const runtime = new SoloRuntime()
runtime.registerMap({ id: 'village', width: 1280, height: 720 })
runtime.spawnEntity({
  id: 'hero',
  kind: 'player',
  mapId: 'village',
  x: 64,
  y: 64
})

runtime.dispatch({
  type: 'move',
  entityId: 'hero',
  vector: { x: 1, y: 0 },
  source: 'human'
})
runtime.stepTicks(1)
```

Legacy action handlers and command interceptors are intentionally excluded from
candidate evaluation unless their registration explicitly attests that the
closure is candidate-safe:

```ts
runtime.registerAction('accept-duty', ({ entity }) => {
  entity.data.duty = 'accepted'
}, { candidateSafe: true })
```

The same option is available on `registerCommandInterceptor()`. Without it, a
candidate action is unknown and a legacy interceptor does not run. This fails
closed instead of letting a closure write live state, persistence, telemetry,
or another external system while an abortable candidate is being evaluated.

Authored props, shrines, signs, and other fixed world objects opt into an
immovable physics body. They still support system teleports and map transfers,
but movement commands and collisions cannot silently push them out of place.

```ts
runtime.spawnEntity({
  id: 'village-waystone',
  kind: 'event',
  mapId: 'village',
  x: 320,
  y: 224,
  immovable: true
})
```

Human controls, Yuka governors, and replay runners use the same `dispatch()`
contract. Ordinary dispatch and stepping mutate the same entity objects
observed by renderers and UI; candidate commits use the explicit rebind seam
described below. There is no client copy, room, socket, or synchronization
layer.

## Atomic candidate ticks

Systems that must validate a complete fixed tick before publishing it can use
`beginCandidateTick()`. The runtime forks one isolated next tick, buffers its
command and tick events, and reduces game-owned JSON state beside Rules. An
abort discards that candidate without touching live state or emitting events;
commit atomically replaces the authoritative Rules object graph and publishes
the Rules view, reduced state, runtime events, and domain events as one
immutable receipt.

```ts
const candidate = runtime.beginCandidateTick({
  id: 'rules-tick:42',
  expectedBaseTick: runtime.tick,
  state: { narrative: [], agency: { decision: 41 } }
})

const result = candidate.dispatch({
  type: 'action',
  entityId: 'guard',
  action: 'accept-duty',
  source: 'ai'
})

if (result.accepted) {
  candidate.reduce(
    {
      id: 'duty:guard:42',
      type: 'DUTY_ACCEPTED',
      tick: candidate.tick,
      payload: { actorId: 'guard' }
    },
    (state) => ({
      ...state,
      narrative: [...state.narrative, 'duty:guard:42'],
      agency: { decision: candidate.tick }
    })
  )
}

const publication = candidate.commit()
// publication contains the committed view and all buffered egress.
```

Candidate action handlers must be deterministic and candidate-local: mutate
only the entity passed in their action context and return a rejection or stage
game-owned consequences through `reduce()`. Logging, analytics, persistence,
audio, UI, and other external effects consume the committed publication; they
must not run from an action handler while a candidate is being evaluated.

`subscribeCandidateTickErrors()` observes exceptions raised by publication or
legacy runtime-event listeners. Notification failures are post-commit
diagnostics: every peer listener still runs, `commit()` still returns its
receipt, and the candidate remains `committed`.

Candidate commits intentionally replace entity object identity so a frozen or
otherwise hostile old entity reference cannot make a transaction half-apply.
Renderers and other identity-caching consumers must use
`subscribeCandidateTicks()` as their post-commit rebind seam, reading the
immutable `publication.view` or reacquiring live entities by id. Ordinary
non-candidate `dispatch()` and `step()` retain their existing in-place identity
behavior.

Commands are strictly cloned and deeply frozen before candidate-safe actions or
interceptors receive them. Executable authority registrations carry a revision,
so changing a handler while a candidate is open makes that candidate stale.
Beginning or committing another candidate during publication is rejected; all
events from the committed tick are materialized before any observer runs.

Only one fixed tick is admitted per candidate. A stale candidate cannot commit
after live state changes, and a new candidate after abort targets the same next
tick. Existing `dispatch()`, `step()`, `stepTicks()`, save, and subscription APIs
remain unchanged for integrations that do not need an atomic authoring gate.

Projectile entities use a sensor-like collision layer: authored map obstacles
still stop them, but players, NPCs, neutral actors, and defeated bodies do not
apply a physics impulse. Combat packages remain responsible for deciding which
overlapped entities are valid targets and for resolving their hits.

Map dimensions are authoritative physics bounds. Spawns, teleports, transfers,
save restores, and fixed-step movement keep the full entity hitbox inside those
bounds, so a dash or collision cannot strand gameplay outside the authored map.

Teleports also sweep the entity hitbox against authored rectangular obstacles,
so dashes and knockbacks stop at walls instead of tunneling through them.
Story-driven gates, bridges, and collapses update the authoritative physics
table without rebuilding the map or losing entity identity:

```ts
const opened = runtime.getMap('village')!.obstacles!.filter(({ id }) => id !== 'north-gate')
runtime.replaceMapObstacles('village', opened)
```

Scripted transitions that truly intend to bypass collision can still use
`collision: 'ignore'`; map bounds remain authoritative in either mode.

The package version records its exact RPGJS v5 baseline. This release is based
on RPGJS `5.0.0-beta.29` and bundles the fork's audited `@rpgjs/physic@5.0.2`
source. That source is newer than the public registry's `5.0.1`; consumers do
not inherit an unavailable or floating runtime dependency.

The `.solo.N` suffix identifies the coordinated private release. Runtime and
build inputs are pinned exactly and refreshed to current compatible releases
before that coordinated version is published.
