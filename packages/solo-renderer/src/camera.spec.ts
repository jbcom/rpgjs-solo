import { describe, expect, it } from 'vitest'
import { resolveSoloCameraZoom } from './camera'

describe('Solo camera zoom', () => {
  it('accepts an explicit fixed zoom', () => {
    expect(resolveSoloCameraZoom({ zoom: 2 }, { width: 1280, height: 720 })).toBe(2)
  })

  it('resolves a responsive zoom from the live canvas size', () => {
    const zoom = resolveSoloCameraZoom(
      { zoom: ({ width }) => width >= 1000 ? 2.5 : 1.5 },
      { width: 1440, height: 900 }
    )
    expect(zoom).toBe(2.5)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid zoom %s',
    (zoom) => {
      expect(() => resolveSoloCameraZoom({ zoom }, { width: 800, height: 600 }))
        .toThrow('positive finite number')
    }
  )
})
