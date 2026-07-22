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
    hero: {
      spritesheet: createRpgMakerSpritesheet('/sprites/hero.png', 3, 4),
      animation: (entity) => typeof entity.data.animation === 'string'
        ? entity.data.animation
        : entity.moving ? 'walk' : 'stand'
    }
  },
  fog: { radius: 160 },
  audio: { autoMuteInTests: true }
})

await renderer.start()
```

`appearance.animation` may also be a fixed animation name. Resolver functions
read the authoritative entity state on each runtime tick, so game packages can
map their own `attack`, `hurt`, `down`, interaction, or other states onto a
spritesheet without adding those rules to Solo's generic renderer.

For occlusion-aware and persistable exploration, supply a game-owned visibility
snapshot. The renderer samples it in tile coordinates and owns only the display
surface; line-of-sight rules and save migrations remain in the game:

```ts
fog: {
  smooth: false,
  visibility: () => ({
    mapId: activeMap.id,
    width: activeMap.width,
    height: activeMap.height,
    tileSize: 16,
    revision: visibility.revision,
    stateAt: (x, y) => visibility.visible.has(y * activeMap.width + x)
      ? 'visible'
      : visibility.discovered.has(y * activeMap.width + x)
        ? 'explored'
        : 'unknown'
  })
}
```
