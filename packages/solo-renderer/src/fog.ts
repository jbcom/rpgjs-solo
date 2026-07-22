import type {
  SoloFogController,
  SoloFogVisibilityProvider,
  SoloFogVisibilitySnapshot,
  SoloFogVisibilityState
} from './types'

const UNKNOWN: SoloFogVisibilityState = 'unknown'

const sampleWorld = (
  snapshot: SoloFogVisibilitySnapshot | null,
  x: number,
  y: number
): SoloFogVisibilityState => {
  if (!snapshot || !Number.isFinite(x) || !Number.isFinite(y) || snapshot.tileSize <= 0) {
    return UNKNOWN
  }
  const tileX = Math.floor(x / snapshot.tileSize)
  const tileY = Math.floor(y / snapshot.tileSize)
  if (tileX < 0 || tileY < 0 || tileX >= snapshot.width || tileY >= snapshot.height) {
    return UNKNOWN
  }
  return snapshot.stateAt(tileX, tileY)
}

export const createSoloFogController = (
  provider: SoloFogVisibilityProvider
): SoloFogController => ({
  version: () => provider()?.revision ?? 0,
  clarityAt: (x, y) => sampleWorld(provider(), x, y) === 'visible' ? 1 : 0,
  isVisibleAt: (x, y) => sampleWorld(provider(), x, y) === 'visible',
  isExploredAt: (x, y) => sampleWorld(provider(), x, y) !== 'unknown',
  stateAt: (x, y) => sampleWorld(provider(), x, y)
})
