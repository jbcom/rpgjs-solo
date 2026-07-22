import { describe, expect, it, vi } from 'vitest'
import type { Ticker } from 'pixi.js'
import { SoloRuntime } from '@jbcom/rpgjs-solo'
import { bindSoloEntityToPixi, bindSoloRuntimeToTicker } from './index'

const createRuntime = () => {
  const runtime = new SoloRuntime()
  runtime.registerMap({ id: 'field', width: 640, height: 480 })
  runtime.spawnEntity({ id: 'hero', kind: 'player', mapId: 'field', x: 10, y: 20 })
  return runtime
}

describe('Pixi bindings', () => {
  it('projects the authoritative entity into a display object without copying state', () => {
    const runtime = createRuntime()
    const set = vi.fn()
    const target = { position: { set }, visible: true }
    const onSync = vi.fn()
    const dispose = bindSoloEntityToPixi(runtime, 'hero', target, { offsetX: 4, offsetY: -2, onSync })

    expect(set).toHaveBeenLastCalledWith(14, 18)
    runtime.dispatch({ type: 'teleport', entityId: 'hero', position: { x: 70, y: 80 } })
    expect(set).toHaveBeenLastCalledWith(74, 78)
    expect(onSync.mock.lastCall?.[0]).toBe(runtime.getEntity('hero'))

    dispose()
    runtime.dispatch({ type: 'teleport', entityId: 'hero', position: { x: 1, y: 2 } })
    expect(set).toHaveBeenCalledTimes(2)
  })

  it('attaches and removes one Pixi v8 ticker callback using raw elapsed time', () => {
    const runtime = createRuntime()
    const callbacks = new Set<(ticker: Ticker) => void>()
    const ticker = {
      add: vi.fn((callback: (ticker: Ticker) => void) => callbacks.add(callback)),
      remove: vi.fn((callback: (ticker: Ticker) => void) => callbacks.delete(callback))
    }
    const dispose = bindSoloRuntimeToTicker(runtime, ticker as unknown as Pick<Ticker, 'add' | 'remove'>)
    const callback = [...callbacks][0]

    callback({ elapsedMS: runtime.fixedStepMs, deltaMS: 1 } as Ticker)
    expect(runtime.tick).toBe(1)
    dispose()
    expect(callbacks.size).toBe(0)
    expect(ticker.remove).toHaveBeenCalledWith(callback)
  })
})
