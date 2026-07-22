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

Human controls, Yuka governors, and replay runners use the same `dispatch()`
contract. Renderers and UI subscribe to the same entity objects mutated by the
runtime; there is no client copy, room, socket, or synchronization layer.

The package version records its exact RPGJS v5 baseline. This release is based
on RPGJS `5.0.0-beta.26` and bundles the fork's audited `@rpgjs/physic@5.0.2`
source. That source is newer than the public registry's `5.0.1`; consumers do
not inherit an unavailable or floating runtime dependency.
