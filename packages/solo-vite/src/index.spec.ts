import { describe, expect, it } from 'vitest'
import { inspectSoloBundle, type SoloOutputBundle, type SoloOutputChunk } from './index'

const chunk = (code: string, fileName = 'game.js'): SoloOutputChunk => ({
  type: 'chunk',
  code,
  fileName,
  name: 'game',
  isEntry: true,
  isDynamicEntry: false,
  facadeModuleId: null,
  moduleIds: [],
  modules: {},
  exports: [],
  imports: [],
  dynamicImports: [],
  implicitlyLoadedBefore: [],
  importedBindings: {},
  referencedFiles: [],
  preliminaryFileName: fileName,
  map: null,
  sourcemapFileName: null
})

describe('RPGJS Solo Vite boundary', () => {
  it('accepts a transport-free production chunk', () => {
    const bundle = { 'game.js': chunk('const game = "solo"') } as SoloOutputBundle
    expect(inspectSoloBundle(bundle, { maxEntryBytes: 100 })).toEqual([])
  })

  it('reports network architecture and size violations', () => {
    const bundle = { 'game.js': chunk('new WebSocket("wss://example")') } as SoloOutputBundle
    expect(inspectSoloBundle(bundle, { maxEntryBytes: 10 })).toEqual([
      { fileName: 'game.js', reason: 'contains banned term WebSocket' },
      { fileName: 'game.js', reason: 'entry exceeds 10 bytes' }
    ])
  })
})
