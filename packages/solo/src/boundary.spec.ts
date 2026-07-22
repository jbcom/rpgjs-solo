import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'
import physicPackageJson from '../../physic/package.json'

const collectSources = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? collectSources(path) : path.endsWith('.ts') ? [path] : []
  })

describe('Solo production boundary', () => {
  it('bundles the audited latest physics leaf without runtime dependencies', () => {
    expect('dependencies' in packageJson).toBe(false)
    expect(packageJson.devDependencies['@rpgjs/physic']).toBe('workspace:5.0.2')
    expect(physicPackageJson.version).toBe('5.0.2')
  })

  it('contains no multiplayer transport or synchronization imports', () => {
    const productionSource = collectSources(join(import.meta.dirname, '.'))
      .filter((path) => !path.endsWith('.spec.ts'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')

    for (const banned of [
      '@signe/room',
      '@signe/sync',
      'partysocket',
      'WebSocket',
      'socket.io',
      'node:http',
      'node:https'
    ]) {
      expect(productionSource, `banned Solo runtime dependency: ${banned}`).not.toContain(banned)
    }
  })
})
