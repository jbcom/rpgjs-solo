import { afterEach, describe, expect, it, vi } from 'vitest'
import { SoloRuntime } from '@jbcom/rpgjs-solo'
import { SoloKeyboardInput } from './input'

describe('SoloKeyboardInput UI ownership', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not leak handled or interactive overlay keys into gameplay', () => {
    let keydown: ((event: KeyboardEvent) => void) | undefined
    vi.stubGlobal('document', {
      addEventListener: (type: string, listener: (event: KeyboardEvent) => void) => {
        if (type === 'keydown') keydown = listener
      },
      removeEventListener: () => undefined
    })
    vi.stubGlobal('window', {
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    })
    class FakeElement {
      closest(): FakeElement {
        return this
      }
    }
    vi.stubGlobal('Element', FakeElement)

    const runtime = new SoloRuntime()
    runtime.registerMap({ id: 'test', width: 100, height: 100 })
    runtime.spawnEntity({ id: 'hero', kind: 'player', mapId: 'test', x: 10, y: 10 })
    const input = new SoloKeyboardInput(runtime, 'hero')
    input.start()
    expect(keydown).toBeDefined()

    keydown?.({
      code: 'Escape',
      repeat: false,
      defaultPrevented: true,
      composedPath: () => [],
      preventDefault: vi.fn()
    } as unknown as KeyboardEvent)
    expect(runtime.paused).toBe(false)

    const control = new FakeElement()
    keydown?.({
      code: 'Space',
      repeat: false,
      defaultPrevented: false,
      composedPath: () => [control],
      preventDefault: vi.fn()
    } as unknown as KeyboardEvent)
    expect(runtime.getCommandLog()).toHaveLength(0)

    keydown?.({
      code: 'Escape',
      repeat: false,
      defaultPrevented: false,
      composedPath: () => [],
      preventDefault: vi.fn()
    } as unknown as KeyboardEvent)
    expect(runtime.paused).toBe(true)
  })
})
