import { computed, signal, type Signal, type WritableSignal } from 'canvasengine'
import type { SoloDirection, SoloEntityState, SoloRuntime, SoloRuntimeEvent } from '@jbcom/rpgjs-solo'
import type { SoloEntityAppearance, SoloRenderedMap, SoloRendererOptions } from './types'

export interface SoloRenderEntity {
  readonly id: string
  readonly state: SoloEntityState
  readonly x: WritableSignal<number>
  readonly y: WritableSignal<number>
  readonly direction: WritableSignal<SoloDirection>
  readonly moving: WritableSignal<boolean>
  readonly animation: WritableSignal<string>
  readonly visible: WritableSignal<boolean>
  readonly appearance: SoloEntityAppearance
}

export class SoloRendererModel {
  readonly entities = signal<SoloRenderEntity[]>([])
  readonly activeMap = signal<SoloRenderedMap | null>(null)
  readonly worldWidth: Signal<number>
  readonly worldHeight: Signal<number>

  private readonly entityViews = new Map<string, SoloRenderEntity>()
  private readonly maps = new Map<string, SoloRenderedMap>()
  private readonly unsubscribe: () => void

  constructor(private readonly options: SoloRendererOptions) {
    for (const map of options.maps) this.maps.set(map.id, map)
    this.worldWidth = computed(() => this.activeMap()?.runtime.width ?? 1)
    this.worldHeight = computed(() => this.activeMap()?.runtime.height ?? 1)
    this.syncAll()
    this.unsubscribe = options.runtime.subscribe((event) => this.onRuntimeEvent(event))
  }

  get runtime(): SoloRuntime {
    return this.options.runtime
  }

  get playerId(): string {
    return this.options.playerId
  }

  registerMap(map: SoloRenderedMap): void {
    this.maps.set(map.id, map)
    if (this.options.runtime.activeMapId === map.id) this.activeMap.set(map)
  }

  dispose(): void {
    this.unsubscribe()
    this.entityViews.clear()
    this.entities.set([])
  }

  private onRuntimeEvent(event: SoloRuntimeEvent): void {
    switch (event.type) {
      case 'tick':
      case 'restored':
        this.syncAll()
        break
      case 'entity-spawned':
      case 'entity-transferred':
      case 'entity-removed':
      case 'active-map':
        this.syncAll()
        break
    }
  }

  private syncAll(): void {
    const activeMapId = this.options.runtime.activeMapId
    const nextMap = activeMapId ? this.maps.get(activeMapId) ?? null : null
    if (this.activeMap() !== nextMap) this.activeMap.set(nextMap)
    const states = activeMapId ? this.options.runtime.getEntities(activeMapId) : []
    const activeIds = new Set(states.map(({ id }) => id))

    for (const id of this.entityViews.keys()) {
      if (!activeIds.has(id)) this.entityViews.delete(id)
    }
    for (const state of states) {
      const current = this.entityViews.get(state.id)
      if (current) this.syncEntity(current)
      else this.entityViews.set(state.id, this.createEntity(state))
    }
    const nextEntities = states.map(({ id }) => this.entityViews.get(id)!)
    const currentEntities = this.entities()
    if (
      currentEntities.length !== nextEntities.length
      || currentEntities.some((entity, index) => entity !== nextEntities[index])
    ) {
      this.entities.set(nextEntities)
    }
  }

  private createEntity(state: SoloEntityState): SoloRenderEntity {
    const appearance = this.options.appearances?.[state.id]
      ?? this.options.resolveAppearance?.(state)
      ?? {}
    return {
      id: state.id,
      state,
      x: signal(state.position.x),
      y: signal(state.position.y),
      direction: signal(state.direction),
      moving: signal(state.moving),
      animation: signal(this.resolveAnimation(appearance, state)),
      visible: signal(true),
      appearance
    }
  }

  private syncEntity(entity: SoloRenderEntity): void {
    entity.x.set(entity.state.position.x)
    entity.y.set(entity.state.position.y)
    entity.direction.set(entity.state.direction)
    entity.moving.set(entity.state.moving)
    entity.animation.set(this.resolveAnimation(entity.appearance, entity.state))
  }

  private resolveAnimation(appearance: SoloEntityAppearance, state: SoloEntityState): string {
    if (typeof appearance.animation === 'function') return appearance.animation(state)
    return appearance.animation ?? (state.moving ? 'walk' : 'stand')
  }
}
