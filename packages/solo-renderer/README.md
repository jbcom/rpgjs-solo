# @jbcom/rpgjs-solo-renderer

The renderer installs the fleet's versioned
`@arcade-cabinet/rpgjs-patches` compatibility layer before CanvasEngine scene
creation. This keeps rapid standalone map replacement safe on CanvasEngine
2.0.1 while centralizing the upstream lifecycle workarounds for every Solo
consumer. Each active map also owns an isolated, keyed viewport and `TiledMap`
element so stale async tileset loads or retiring camera directives cannot
overwrite a newer destination. The shared patch normalizes CanvasEngine's
boolean clamp to pixi-viewport's supported all-direction contract.
It also cancels late spritesheet play/update callbacks after Pixi has cleared a
retiring sprite's transforms, preventing async animation mounts from writing
into a destroyed map scene.

The native rendering and authoring layer for RPGJS Solo. It keeps the RPGJS
Tiled workflow and composes CanvasEngine's scene graph, camera, spritesheets,
and fog-of-war directly around `SoloRuntime` state.

`loadSoloTiledMap` derives center-based Solo physics obstacles from collision
tiles on every authored layer. It supports both the `collision: true` tile
property and RPGJS/Tiled tileset object groups, preserving rectangular or
polygon bounds instead of silently treating the decorative ground layer as the
only collision authority. Contiguous full-tile collision is coalesced into
larger rectangles before physics registration, while partial and polygonal
shapes remain independent.

There is no socket, room, sync, prediction, reconciliation, or game-facing
Pixi adapter. Pixi remains an implementation detail of CanvasEngine.

CanvasEngine, its Tiled/preset packages, Pixi, Vite, TypeScript, Vitest, and
declaration tooling are pinned to versions checked as current for each private
release; renderer feature-completeness includes that alignment gate.
Release this workspace package with `pnpm publish`, which rewrites its
`workspace:` core dependency to the exact published Solo version. The shared
Solo publish guard rejects `npm publish`, and the fleet-wide packed-manifest
check prevents registry consumers from receiving an unresolved workspace
protocol.

`renderer.uiRoot` is a framework-neutral DOM overlay. Use the inherited,
current `@rpgjs/ui-css` primitives there directly or mount the game's chosen UI
framework into it; the renderer does not invent a second widget system.
Keyboard input respects UI ownership: default-prevented events and keys whose
composed path is inside a button, form control, dialog, editable region, or
`data-solo-input-owner` surface do not leak into movement, interaction, or pause.

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
  camera: {
    zoom: ({ width }) => width >= 1200 ? 2.5 : width >= 720 ? 2 : 1.5
  },
  fog: { radius: 160 },
  audio: { autoMuteInTests: true }
})

await renderer.start()
```

`camera.zoom` may be a fixed positive scale or a resolver over the live canvas
size. Responsive resolvers run again after resizes and orientation changes; the
renderer delegates to pixi-viewport's centered `setZoom` operation and keeps the
keyed map viewport and player-follow lifecycle intact.

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
