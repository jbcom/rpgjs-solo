import {
  Canvas,
  Circle,
  Container,
  Sprite,
  Viewport,
  computed,
  cond,
  h,
  loop,
  type ComponentFunction
} from 'canvasengine'
import { FogOfWar, TiledMap, createFogOfWarController, type FogOfWarController } from '@canvasengine/presets'
import type { SoloFogOptions, SoloRendererOptions } from './types'
import type { SoloRenderEntity, SoloRendererModel } from './model'

const entityElement = (
  entity: SoloRenderEntity,
  playerId: string,
  fogController: FogOfWarController | null
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
        playing: computed(() => entity.moving() ? 'walk' : 'stand'),
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
  fogController: FogOfWarController | null
}

export const createSoloScene = (
  model: SoloRendererModel,
  options: SoloRendererOptions
): SoloSceneComposition => {
  const fogController = options.fog === false ? null : createFogOfWarController()
  const component: ComponentFunction = () => h(Canvas, {
    width: options.width ?? '100%',
    height: options.height ?? '100%',
    backgroundColor: options.background ?? '#090d16'
  } as never, h(Viewport, {
    worldWidth: model.worldWidth,
    worldHeight: model.worldHeight,
    clamp: true,
    sortableChildren: true
  } as never, [
    cond(
      computed(() => model.activeMap() !== null),
      () => h(TiledMap, {
        map: computed(() => model.activeMap()?.parsedMap),
        // loadSoloTiledMap resolves every tileset image against its TSX file.
        // Passing that map directory again would double-prefix image URLs.
        basePath: '',
        createLayersPerTilesZ: true
      })
    ),
    loop(model.entities, (entity: SoloRenderEntity) => entityElement(entity, options.playerId, fogController) as never, {
      track: (entity: SoloRenderEntity) => entity.id
    }),
    ...(fogController ? [createFogElement(model, options.playerId, options.fog || {}, fogController)] : [])
  ]))

  return { component, fogController }
}
