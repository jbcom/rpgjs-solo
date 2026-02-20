import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readJson } from '../src/utils/fs.js'
import { configurePackageJson } from '../src/features/package-json.js'

describe('configurePackageJson', () => {
  it('should apply base dependencies and typescript dependencies', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'create-rpgjs-test-'))
    const file = path.join(dir, 'package.json')

    await writeFile(
      file,
      JSON.stringify(
        {
          name: 'demo',
          scripts: {
            dev: 'vite'
          }
        },
        null,
        2
      )
    )

    await configurePackageJson(dir, {
      projectName: 'my-game',
      features: {
        typescript: true
      }
    })

    const pkg = await readJson(file)

    expect(pkg.name).toBe('my-game')
    expect(pkg.type).toBe('module')
    expect(pkg.dependencies['@rpgjs/client']).toBeDefined()
    expect(pkg.devDependencies.typescript).toBeDefined()
  })
})
