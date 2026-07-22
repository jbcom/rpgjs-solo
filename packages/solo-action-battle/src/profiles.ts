import type { NormalizedSoloAttackProfile, SoloAttackProfile } from './types'

// Adapted from RPGJS v5 packages/action-battle/src/core/attack-profile.ts.
// Solo uses fixed ticks instead of wall-clock timers so save/replay and governed
// playthroughs remain deterministic.
export const DEFAULT_SOLO_ATTACK_PROFILE: NormalizedSoloAttackProfile = {
  id: 'basic',
  startupTicks: 0,
  activeTicks: 7,
  recoveryTicks: 14,
  cooldownTicks: 21,
  movementLock: true,
  directionLock: true,
  hitPolicy: 'oncePerTarget',
  totalTicks: 21
}

const ticks = (value: number | undefined, fallback: number, minimum = 0): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.floor(value))
    : fallback

export const normalizeSoloAttackProfile = (
  profile: SoloAttackProfile = {}
): NormalizedSoloAttackProfile => {
  const startupTicks = ticks(profile.startupTicks, DEFAULT_SOLO_ATTACK_PROFILE.startupTicks)
  const activeTicks = ticks(profile.activeTicks, DEFAULT_SOLO_ATTACK_PROFILE.activeTicks, 1)
  const recoveryTicks = ticks(profile.recoveryTicks, DEFAULT_SOLO_ATTACK_PROFILE.recoveryTicks)
  const totalTicks = startupTicks + activeTicks + recoveryTicks
  return {
    id: profile.id ?? DEFAULT_SOLO_ATTACK_PROFILE.id,
    startupTicks,
    activeTicks,
    recoveryTicks,
    cooldownTicks: ticks(profile.cooldownTicks, totalTicks),
    movementLock: profile.movementLock ?? DEFAULT_SOLO_ATTACK_PROFILE.movementLock,
    directionLock: profile.directionLock ?? DEFAULT_SOLO_ATTACK_PROFILE.directionLock,
    hitPolicy: profile.hitPolicy === 'allowRepeatHits' ? 'allowRepeatHits' : 'oncePerTarget',
    totalTicks
  }
}
