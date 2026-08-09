import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  installCanvasEnginePatches: vi.fn(),
  Sprite: vi.fn(),
  Viewport: vi.fn()
}))

vi.mock('canvasengine', () => ({
  bootstrapCanvas: vi.fn(),
  Howler: { mute: vi.fn() },
  Sprite: mocks.Sprite,
  Viewport: mocks.Viewport
}))

vi.mock('./input', () => ({
  SoloKeyboardInput: class {
    start(): void {}
    stop(): void {}
  }
}))

vi.mock('./model', () => ({
  SoloRendererModel: class {
    registerMap(): void {}
    dispose(): void {}
  }
}))

vi.mock('./scene', () => ({
  createSoloScene: () => ({ component: vi.fn(), fogController: null })
}))

import { SoloRenderer } from './renderer'
import { rpgjsSoloRendererCompatibility } from './compatibility'
import type { SoloRendererOptions } from './types'

describe('SoloRenderer CanvasEngine compatibility', () => {
  beforeEach(() => {
    mocks.installCanvasEnginePatches.mockClear()
  })

  it('installs the shared lifecycle patches before scene bootstrap', () => {
    const target = document.createElement('div')
    const options = {
      target,
      runtime: {},
      playerId: 'hero',
      maps: [],
      input: false,
      installCanvasEnginePatches: mocks.installCanvasEnginePatches
    } as unknown as SoloRendererOptions

    const renderer = new SoloRenderer(options)

    expect(mocks.installCanvasEnginePatches).toHaveBeenCalledWith({
      Sprite: mocks.Sprite,
      Viewport: mocks.Viewport
    })
    renderer.destroy()
  })

  it('does not require a private fleet package in public consumers', () => {
    const target = document.createElement('div')
    const options = {
      target,
      runtime: {},
      playerId: 'hero',
      maps: [],
      input: false
    } as unknown as SoloRendererOptions

    const renderer = new SoloRenderer(options)

    expect(mocks.installCanvasEnginePatches).not.toHaveBeenCalled()
    renderer.destroy()
  })

  it('publishes the exact consumer-injected compatibility matrix', () => {
    expect(rpgjsSoloRendererCompatibility).toEqual({
      canvasengine: '2.2.0',
      vite: '8.2.1',
      patches: {
        package: '@arcade-cabinet/rpgjs-patches',
        version: '0.3.0',
        installer: 'installCanvasEnginePatches',
        timing: 'before-scene-bootstrap'
      }
    })
  })
})
