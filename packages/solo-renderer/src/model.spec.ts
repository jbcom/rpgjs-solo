import { describe, expect, it } from 'vitest'
import { SoloRuntime } from '@jbcom/rpgjs-solo'
import { SoloRendererModel } from './model'
import type { SoloAppearanceResolver, SoloRenderedMap, SoloRendererOptions } from './types'

const renderedMap = (id: string): SoloRenderedMap => ({
  id,
  basePath: `/maps/${id}/`,
  parsedMap: {} as SoloRenderedMap['parsedMap'],
  runtime: { id, width: 640, height: 480 }
})

const createModel = (resolveAppearance?: SoloAppearanceResolver) => {
  const runtime = new SoloRuntime()
  const field = renderedMap('field')
  const town = renderedMap('town')
  runtime.registerMap(field.runtime)
  runtime.registerMap(town.runtime)
  runtime.spawnEntity({ id: 'hero', kind: 'player', mapId: 'field', x: 32, y: 48, speed: 60 })
  runtime.spawnEntity({ id: 'guard', kind: 'npc', mapId: 'town', x: 80, y: 96 })
  const options = {
    runtime,
    target: {} as HTMLElement,
    playerId: 'hero',
    maps: [field, town],
    resolveAppearance
  } satisfies SoloRendererOptions
  return { runtime, model: new SoloRendererModel(options) }
}

describe('SoloRendererModel', () => {
  it('projects authoritative entities into stable reactive views', () => {
    const { runtime, model } = createModel()
    const hero = model.entities()[0]

    runtime.dispatch({ type: 'move', entityId: 'hero', vector: { x: 1, y: 0 }, source: 'human' })
    runtime.stepTicks(10)

    expect(model.entities()[0]).toBe(hero)
    expect(hero.x()).toBe(runtime.getEntity('hero')!.position.x)
    expect(hero.moving()).toBe(true)
    expect(hero.direction()).toBe('right')
    model.dispose()
  })

  it('switches rendered maps from the runtime transfer without replacing the player view', () => {
    const { runtime, model } = createModel()
    const hero = model.entities()[0]

    runtime.dispatch({
      type: 'transfer-map',
      entityId: 'hero',
      mapId: 'town',
      position: { x: 120, y: 144 },
      source: 'system'
    })

    expect(model.activeMap()?.id).toBe('town')
    expect(model.entities().map(({ id }) => id)).toEqual(['hero', 'guard'])
    expect(model.entities().find(({ id }) => id === 'hero')).toBe(hero)
    model.dispose()
  })

  it('projects game-owned animation state without embedding combat rules', () => {
    const { runtime, model } = createModel((entity) => entity.id === 'hero' ? {
      animation: (state) => typeof state.data.animation === 'string'
        ? state.data.animation
        : state.moving ? 'walk' : 'stand'
    } : undefined)
    const hero = model.entities()[0]
    runtime.registerAction('test:attack', ({ entity }) => {
      entity.data.animation = 'attack'
    })

    expect(hero.animation()).toBe('stand')
    runtime.dispatch({ type: 'action', entityId: 'hero', action: 'test:attack' })
    runtime.stepTicks(1)

    expect(model.entities()[0]).toBe(hero)
    expect(hero.animation()).toBe('attack')
    model.dispose()
  })
})
