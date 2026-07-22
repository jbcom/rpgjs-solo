# @jbcom/rpgjs-solo-renderer

The native rendering and authoring layer for RPGJS Solo. It keeps the RPGJS
Tiled workflow and composes CanvasEngine's scene graph, camera, spritesheets,
and fog-of-war directly around `SoloRuntime` state.

There is no socket, room, sync, prediction, reconciliation, or game-facing
Pixi adapter. Pixi remains an implementation detail of CanvasEngine.

CanvasEngine, its Tiled/preset packages, Pixi, Vite, TypeScript, Vitest, and
declaration tooling are pinned to versions checked as current for each private
release; renderer feature-completeness includes that alignment gate.

`renderer.uiRoot` is a framework-neutral DOM overlay. Use the inherited,
current `@rpgjs/ui-css` primitives there directly or mount the game's chosen UI
framework into it; the renderer does not invent a second widget system.

```ts
import { SoloRuntime } from '@jbcom/rpgjs-solo'
import {
  SoloRenderer,
  createRpgMakerSpritesheet,
  loadSoloTiledMap
} from '@jbcom/rpgjs-solo-renderer'

const runtime = new SoloRuntime()
const field = await loadSoloTiledMap({ id: 'field', basePath: '/maps' })
runtime.registerMap(field.runtime)
runtime.spawnEntity({ id: 'hero', kind: 'player', mapId: 'field', x: 96, y: 96 })

const renderer = new SoloRenderer({
  runtime,
  target: document.querySelector('#rpg')!,
  playerId: 'hero',
  maps: [field],
  appearances: {
    hero: { spritesheet: createRpgMakerSpritesheet('/sprites/hero.png', 3, 4) }
  },
  fog: { radius: 160 },
  audio: { autoMuteInTests: true }
})

await renderer.start()
```
