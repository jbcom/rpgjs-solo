import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  installCanvasEnginePatches: vi.fn(),
  Sprite: vi.fn(),
  Viewport: vi.fn()
}))

vi.mock('@arcade-cabinet/rpgjs-patches', () => ({
  installCanvasEnginePatches: mocks.installCanvasEnginePatches
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
      input: false
    } as unknown as SoloRendererOptions

    const renderer = new SoloRenderer(options)

    expect(mocks.installCanvasEnginePatches).toHaveBeenCalledWith({
      Sprite: mocks.Sprite,
      Viewport: mocks.Viewport
    })
    renderer.destroy()
  })
})
