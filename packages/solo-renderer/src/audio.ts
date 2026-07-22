import { Howler } from 'canvasengine'
import type { SoloAudioOptions } from './types'

export const detectSoloTestMode = (): boolean => {
  if (typeof navigator !== 'undefined' && navigator.webdriver) return true
  if (typeof location !== 'undefined') {
    const params = new URLSearchParams(location.search)
    if (params.get('mute') === '1' || params.get('test') === '1') return true
  }
  return false
}

export const resolveInitialMute = (
  options: SoloAudioOptions = {},
  testMode = detectSoloTestMode()
): boolean => options.muted ?? (options.autoMuteInTests !== false && testMode)

export const setSoloMuted = (muted: boolean): void => Howler.mute(muted)
