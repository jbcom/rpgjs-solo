import type { Ticker } from 'pixi.js'
import type { SoloEntityState, SoloRuntime, SoloRuntimeEvent } from '@jbcom/rpgjs-solo'

export interface SoloPixiPositionTarget {
  position: {
    set(x: number, y: number): unknown
  }
  visible?: boolean
}

export interface SoloPixiEntityBindingOptions {
  offsetX?: number
  offsetY?: number
  visibleOnlyOnActiveMap?: boolean
  onSync?: (entity: SoloEntityState, target: SoloPixiPositionTarget) => void
}

export interface SoloPixiTickerOptions {
  /** Use Pixi's raw, uncapped frame duration. The Solo runtime applies its own clamp. */
  rawElapsedTime?: boolean
}

/**
 * Keeps one Pixi display object aligned with the authoritative Solo entity.
 * The adapter stores no copy of gameplay state.
 */
export const bindSoloEntityToPixi = (
  runtime: SoloRuntime,
  entityId: string,
  target: SoloPixiPositionTarget,
  options: SoloPixiEntityBindingOptions = {}
): (() => void) => {
  const sync = (): void => {
    const entity = runtime.getEntity(entityId)
    if (!entity) {
      if (target.visible !== undefined) target.visible = false
      return
    }
    target.position.set(entity.position.x + (options.offsetX ?? 0), entity.position.y + (options.offsetY ?? 0))
    if (target.visible !== undefined) {
      target.visible = !options.visibleOnlyOnActiveMap || entity.mapId === runtime.activeMapId
    }
    options.onSync?.(entity, target)
  }

  const relevant = (event: SoloRuntimeEvent): boolean => {
    if (event.type === 'tick' || event.type === 'restored' || event.type === 'active-map') return true
    if (event.type === 'entity-removed') return event.entityId === entityId
    if (event.type === 'entity-spawned' || event.type === 'entity-transferred') return event.entity.id === entityId
    return event.type === 'command' && event.record.command.entityId === entityId
  }

  sync()
  return runtime.subscribe((event) => {
    if (relevant(event)) sync()
  })
}

/**
 * Feeds Pixi v8 ticker time into Solo's fixed-step accumulator. The same
 * callback reference is removed on cleanup, as required by Pixi's ticker API.
 */
export const bindSoloRuntimeToTicker = (
  runtime: SoloRuntime,
  ticker: Pick<Ticker, 'add' | 'remove'>,
  options: SoloPixiTickerOptions = {}
): (() => void) => {
  const update = (current: Ticker): void => {
    runtime.step(options.rawElapsedTime === false ? current.deltaMS : current.elapsedMS)
  }
  ticker.add(update)
  return () => ticker.remove(update)
}
