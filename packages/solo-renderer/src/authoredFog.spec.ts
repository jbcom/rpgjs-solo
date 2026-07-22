import { describe, expect, it } from 'vitest'
import { createSoloFogController } from './fog'
import type { SoloFogVisibilitySnapshot } from './types'

describe('authored fog controller', () => {
  it('projects game-owned tile visibility into CanvasEngine world coordinates', () => {
    let revision = 4
    const states = ['unknown', 'explored', 'visible', 'unknown'] as const
    const snapshot = (): SoloFogVisibilitySnapshot => ({
      mapId: 'watchtower',
      width: 2,
      height: 2,
      tileSize: 16,
      revision,
      stateAt: (tileX, tileY) => states[tileY * 2 + tileX] ?? 'unknown'
    })
    const controller = createSoloFogController(snapshot)

    expect(controller.version()).toBe(4)
    expect(controller.stateAt(8, 8)).toBe('unknown')
    expect(controller.stateAt(24, 8)).toBe('explored')
    expect(controller.stateAt(8, 24)).toBe('visible')
    expect(controller.isExploredAt(24, 8)).toBe(true)
    expect(controller.isVisibleAt(24, 8)).toBe(false)
    expect(controller.clarityAt(8, 24)).toBe(1)
    expect(controller.stateAt(-1, 8)).toBe('unknown')
    expect(controller.stateAt(40, 8)).toBe('unknown')

    revision += 1
    expect(controller.version()).toBe(5)
  })
})
