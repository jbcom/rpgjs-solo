import {
  Canvas,
  Circle,
  Container,
  Sprite,
  Viewport,
  computed,
  h,
  loop,
  mount,
  type ComponentFunction
} from 'canvasengine'
import { FogOfWar, TiledMap, createFogOfWarController, type FogOfWarController } from '@canvasengine/presets'
import { createAuthoredFogElement } from './authoredFog'
import { createSoloFogController } from './fog'
import type { SoloFogController, SoloFogOptions, SoloRenderedMap, SoloRendererOptions } from './types'
import type { SoloRenderEntity, SoloRendererModel } from './model'

const entityElement = (
  entity: SoloRenderEntity,
  playerId: string,
  fogController: SoloFogController | null
) => {
  const appearance = entity.appearance
  const fogMode = appearance.visibleInFog ?? (entity.id === playerId ? 'always' : 'visible')
  const containerProps = {
    x: entity.x,
    y: entity.y,
    zIndex: computed(() => entity.y() + (appearance.zOffset ?? 0)),
    visible: entity.visible,
    viewportFollow: entity.id === playerId ? { speed: 0, radius: 8 } : undefined,
    fogVisibility: fogMode === 'always' || !fogController ? undefined : {
      controller: fogController,
      mode: fogMode,
      point: { x: entity.x, y: entity.y }
    }
  }

  const graphic = appearance.spritesheet
    ? h(Sprite, {
      sheet: {
        definition: appearance.spritesheet,
        playing: entity.animation,
        params: { direction: entity.direction }
      },
      anchor: appearance.anchor ?? [0.5, 1]
    } as never)
    : h(Circle, {
      radius: Math.max(2, (appearance.width ?? 16) / 2),
      color: appearance.color ?? (entity.id === playerId ? '#f1d28a' : '#8fb3c9'),
      anchor: appearance.anchor ?? [0.5, 0.5]
    })

  return h(Container, containerProps as never, graphic)
}

const createFogElement = (
  model: SoloRendererModel,
  playerId: string,
  options: SoloFogOptions,
  controller: FogOfWarController
) => h(FogOfWar, {
  controller,
  mapWidth: model.worldWidth,
  mapHeight: model.worldHeight,
  tileSize: options.tileSize ?? 16,
  smooth: options.smooth ?? true,
  renderScale: options.renderScale ?? 0.5,
  edgeSoftness: options.edgeSoftness ?? 0.22,
  updateHz: options.updateHz ?? 30,
  colors: {
    unknown: options.unknownColor ?? [5, 7, 14, 1],
    explored: options.exploredColor ?? [12, 16, 28, 0.72]
  },
  visionSources: () => {
    const player = model.entities().find(({ id }) => id === playerId)
    return player ? [{ x: player.x, y: player.y, radius: options.radius ?? 144 }] : []
  }
})

export interface SoloSceneComposition {
  component: ComponentFunction
  fogController: SoloFogController | null
}

const contextScope = (child: ReturnType<typeof h>) => {
  const Scope: ComponentFunction = () => {
    mount((element) => {
      // CanvasEngine normally shares one mutable context through the complete
      // scene. Isolating each keyed viewport prevents a retiring map's
      // directives from removing camera plugins from its successor.
      element.props.context = { ...element.props.context }
    })
    return h(Container, {}, child)
  }

  return h(Scope)
}

export const createSoloScene = (
  model: SoloRendererModel,
  options: SoloRendererOptions
): SoloSceneComposition => {
  const fogOptions = options.fog || {}
  const fogController: SoloFogController | null = options.fog === false
    ? null
    : fogOptions.visibility
      ? createSoloFogController(fogOptions.visibility)
      : createFogOfWarController()
  const activeMaps = computed(() => {
    const activeMap = model.activeMap()
    return activeMap ? [activeMap] : []
  })
  const component: ComponentFunction = () => h(Canvas, {
    width: options.width ?? '100%',
    height: options.height ?? '100%',
    backgroundColor: options.background ?? '#090d16'
  } as never, loop(activeMaps, (map: SoloRenderedMap) => contextScope(h(Viewport, {
      worldWidth: map.runtime.width,
      worldHeight: map.runtime.height,
      clamp: true,
      sortableChildren: true
    } as never, [
      // @canvasengine/presets loads tilesets in an uncancelled async effect,
      // while pixi-viewport retains camera transforms across world-size
      // changes. A keyed viewport gives each map isolated loader and camera
      // lifecycles, so stale work cannot blank or displace the destination.
      h(TiledMap, {
        map: computed(() => map.parsedMap),
        // loadSoloTiledMap resolves every tileset image against its TSX file.
        // Passing that map directory again would double-prefix image URLs.
        basePath: '',
        createLayersPerTilesZ: true
      }),
      loop(model.entities, (entity: SoloRenderEntity) => entityElement(entity, options.playerId, fogController) as never, {
        track: (entity: SoloRenderEntity) => entity.id
      }),
      ...(fogController
        ? [fogOptions.visibility
          ? createAuthoredFogElement(
            fogOptions.visibility,
            fogOptions,
            model.worldWidth,
            model.worldHeight
          )
          : createFogElement(
            model,
            options.playerId,
            fogOptions,
            fogController as FogOfWarController
          )]
        : [])
    ])) as never, {
        track: (map: SoloRenderedMap) => map.id
      }))

  return { component, fogController }
}
