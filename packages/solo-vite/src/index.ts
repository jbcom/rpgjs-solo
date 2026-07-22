import type { Plugin, Rollup } from 'vite'

export type SoloOutputBundle = Rollup.OutputBundle
export type SoloOutputChunk = Rollup.OutputChunk

export const SOLO_BANNED_BUNDLE_TERMS = [
  '@signe/room',
  '@signe/sync',
  'partysocket',
  'WebSocket',
  'PredictionController',
  'DeterministicInputBuffer',
  'socket.io'
] as const

export interface SoloBoundaryOptions {
  bannedTerms?: readonly string[]
  maxEntryBytes?: number
}

export interface SoloBoundaryViolation {
  fileName: string
  reason: string
}

export const inspectSoloBundle = (
  bundle: SoloOutputBundle,
  options: SoloBoundaryOptions = {}
): SoloBoundaryViolation[] => {
  const bannedTerms = options.bannedTerms ?? SOLO_BANNED_BUNDLE_TERMS
  const violations: SoloBoundaryViolation[] = []

  for (const output of Object.values(bundle)) {
    if (output.type !== 'chunk') continue
    for (const term of bannedTerms) {
      if (output.code.includes(term)) {
        violations.push({ fileName: output.fileName, reason: `contains banned term ${term}` })
      }
    }
    if (output.isEntry && options.maxEntryBytes !== undefined && Buffer.byteLength(output.code) > options.maxEntryBytes) {
      violations.push({
        fileName: output.fileName,
        reason: `entry exceeds ${options.maxEntryBytes} bytes`
      })
    }
  }
  return violations
}

/** Fails a Vite production build when multiplayer architecture leaks into it. */
export const rpgjsSoloBoundary = (options: SoloBoundaryOptions = {}): Plugin => ({
  name: 'rpgjs-solo-boundary',
  apply: 'build',
  enforce: 'post',
  generateBundle(_outputOptions, bundle) {
    const violations = inspectSoloBundle(bundle, options)
    if (violations.length > 0) {
      this.error(`RPGJS Solo boundary failed:\n${violations.map(({ fileName, reason }) => `- ${fileName}: ${reason}`).join('\n')}`)
    }
  }
})
