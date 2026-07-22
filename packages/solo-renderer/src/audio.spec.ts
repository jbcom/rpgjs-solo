import { describe, expect, it } from 'vitest'
import { resolveInitialMute } from './audio'

describe('Solo renderer audio policy', () => {
  it('auto-mutes automated playthroughs by default', () => {
    expect(resolveInitialMute({}, true)).toBe(true)
    expect(resolveInitialMute({ autoMuteInTests: false }, true)).toBe(false)
  })

  it('honors an explicit mute choice over test detection', () => {
    expect(resolveInitialMute({ muted: false }, true)).toBe(false)
    expect(resolveInitialMute({ muted: true }, false)).toBe(true)
  })
})
