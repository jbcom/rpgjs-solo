---
title: "Lighting"
description: "Guide for map lighting, light spots, shadows, and day/night transitions in RPGJS."
---

# Lighting

Manage map lighting from the server and add temporary client-only spots for local effects.

Lighting is rendered by the engine with CanvasEngine presets. You do not need to import `NightAmbient` or `SpriteShadows` in your map components.

## Shared Types

Lighting types are exported by `@rpgjs/common`:

```ts
import type { LightingState, LightSpot } from '@rpgjs/common'
```

## Initial Map Lighting

Set initial lighting in `@MapData()` or in a map entry inside your server module:

```ts
import { MapData, RpgMap } from '@rpgjs/server'

@MapData({
  id: 'forest-night',
  file: require('./tmx/forest.tmx'),
  lighting: {
    ambient: {
      darkness: 0.45,
      darkColor: '#0a1020',
      fogColor: '#141a2a',
      fogRadius: 0.5,
      fogSoftness: 0.35,
      fogOpacity: 0.35
    },
    spots: [
      { x: 320, y: 180, radius: 160, intensity: 1, flicker: true }
    ],
    sun: {
      intensity: 0.35
    },
    shadows: {
      enabled: true,
      ambientLight: { x: -0.18, y: -1, z: 420, intensity: 0.18 },
      minInfluence: 0.16,
      falloffPower: 1.2,
      scanHz: 8,
      cullToViewport: true
    }
  }
})
export class ForestNightMap extends RpgMap {}
```

## Runtime API (Server)

`RpgMap` exposes:

- `map.getLighting(): LightingState | null`
- `map.setLighting(next: LightingState | null, options?: { sync?: boolean })`
- `map.patchLighting(patch: Partial<LightingState>, options?: { sync?: boolean })`
- `map.clearLighting(options?: { sync?: boolean })`
- `map.setDay(options?: { sync?: boolean })`
- `map.setNight(options?: { sync?: boolean })`
- `map.transitionLighting(toLighting, options?: { duration?: number, easing?: 'linear' | 'easeInOut' })`

Example:

```ts
map.setNight()

map.patchLighting({
  spots: [
    { id: 'campfire', x: 500, y: 420, radius: 190, intensity: 1.2, flicker: true }
  ]
})

map.transitionLighting({
  ambient: { darkness: 0.15 },
  sun: { intensity: 1 },
  shadows: { enabled: false }
}, {
  duration: 3000,
  easing: 'easeInOut'
})
```

When `sync` is not `false`, lighting is broadcast to players in the map.

## Runtime API (Client)

`RpgClientMap` exposes local light spot helpers:

- `sceneMap.addLightSpot(id, spot)`
- `sceneMap.patchLightSpot(id, partialSpot)`
- `sceneMap.removeLightSpot(id)`
- `sceneMap.clearLightSpots()`

Client spots are not synchronized. They are useful for player torches, spells, cursor effects, or cutscenes.

```ts
const sceneMap = engine.sceneMap

sceneMap.addLightSpot('player-torch', {
  x: player.position.x,
  y: player.position.y,
  radius: 180,
  intensity: 1,
  flicker: true
})

sceneMap.patchLightSpot('player-torch', {
  x: player.position.x,
  y: player.position.y
})
```

Local spots are merged with synchronized map spots for rendering and are cleared when the client changes map. Spots do not make the map night by themselves; `NightAmbient` is rendered only when synchronized lighting provides an ambient darkness value greater than `0`, for example through `map.setNight()` or `map.setLighting({ ambient: { darkness: ... } })`. Spots still enable sprite shadows during daytime.

Ambient lighting fields map to CanvasEngine `NightAmbient` props: `darkness` and `darkColor` become the darkness overlay, while `fogColor`, `fogRadius`, `fogSoftness`, and `fogOpacity` configure the haze overlay.

## Shadows

Set `lighting.sun` to enable sun-driven shadows automatically. The engine automatically marks character sprites as shadow casters and derives default shadow sizing from the sprite bounds and hitbox. Use `lighting.shadows.enabled: false` to explicitly disable shadows from the sun.

```ts
map.patchLighting({
  sun: {
    x: -0.45,
    y: -1,
    z: 520,
    intensity: 0.95
  },
  shadows: {
    enabled: true,
    mode: 'strongest',
    updateHz: 30,
    scanHz: 8,
    cullToViewport: true,
    minInfluence: 0.16,
    falloffPower: 1.2
  }
})
```

Map light spots affect shadows even when the map is not in night mode. Sun shadows are rendered as a directional ambient source, so sprite, character, and Studio element shadows keep the same projection across the map instead of changing with distance. Spot lights are still passed as point lights to `SpriteShadows` for character shadows, so nearby torches or element `lightSpot` entries can pull character shadows opposite to the local source according to intensity, radius, and `shadowWeight`. Studio element shadows keep the sun angle whenever an active sun exists, which keeps trees and props visually aligned across the map. `ambientLight` overrides the derived sun direction; set it to `null` or `{ enabled: false }` to disable that directional baseline. In Studio maps, an element with a `lightSpot` is automatically registered as a local light spot, then used by `NightAmbient` when night is active and by shadows whenever the spot exists.

For sun-driven shadows, the default sun behaves like a directional top-left light so sprite shadows project toward the bottom-right with minimal distance variation. Studio v2 rerenders element shadows when map lighting changes. Studio elements use cached Pixi shadow textures projected from the element sprite silhouette and clipped around the bottom of the hitbox, so the cast shadow follows the object shape instead of a generic blurred circle. The projected tail is tuned shorter than a low-sun cast shadow and the contact occlusion is anchored from the opaque pixels at the base of the sprite, including a compressed footprint from the sprite base with a small overlap behind the sprite so trunks and props stay visually attached to the ground without a large circular blob. Studio v2 renders terrain wall shadows as cached Pixi sprites generated from the bottom of each wall face, with a solid contact base and a softer projected tail. These wall shadows do not use `SpriteShadows`, so large wall shapes do not become dynamic shadow casters. Studio elements receive automatic sun shadows even when generated map data has `hasShadow: false`.
