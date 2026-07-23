import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const publishGuard = join(rootDirectory, 'bin', 'require-pnpm-publish.mjs')
const packageDirectories = [
  'packages/solo',
  'packages/solo-action-battle',
  'packages/solo-renderer',
  'packages/solo-vite'
]
const sourceManifests = new Map(
  packageDirectories.map((relativeDirectory) => {
    const directory = join(rootDirectory, relativeDirectory)
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    return [manifest.name, { directory, manifest }]
  })
)

for (const { manifest } of sourceManifests.values()) {
  execFileSync(process.execPath, [publishGuard], {
    env: {
      ...process.env,
      npm_config_user_agent: 'pnpm/11.16.0',
      npm_package_name: manifest.name
    },
    stdio: 'pipe'
  })
}

let rejectedNpm = false
try {
  execFileSync(process.execPath, [publishGuard], {
    env: {
      ...process.env,
      npm_config_user_agent: 'npm/11.0.0',
      npm_package_name: '@jbcom/rpgjs-solo'
    },
    stdio: 'pipe'
  })
} catch {
  rejectedNpm = true
}
if (!rejectedNpm) throw new Error('The shared Solo publish guard accepted npm publish')

const packDirectory = mkdtempSync(join(tmpdir(), 'rpgjs-solo-package-contracts-'))
try {
  for (const { directory, manifest } of sourceManifests.values()) {
    const packageDirectory = join(packDirectory, manifest.name.replaceAll('/', '-'))
    mkdirSync(packageDirectory)
    execFileSync('pnpm', ['pack', '--pack-destination', packageDirectory], {
      cwd: directory,
      stdio: 'pipe'
    })
    const archive = readdirSync(packageDirectory).find((name) => name.endsWith('.tgz'))
    if (!archive) throw new Error(`pnpm pack did not create an archive for ${manifest.name}`)
    const packedManifest = JSON.parse(
      execFileSync('tar', ['-xOf', join(packageDirectory, archive), 'package/package.json'], {
        encoding: 'utf8'
      })
    )
    if (packedManifest.version !== manifest.version) {
      throw new Error(`Packed ${manifest.name} version does not match its source manifest`)
    }
    if (JSON.stringify(packedManifest).includes('workspace:')) {
      throw new Error(`Packed ${manifest.name} manifest still contains a workspace protocol`)
    }
    for (const [dependencyName, dependencyVersion] of Object.entries(
      packedManifest.dependencies ?? {}
    )) {
      const workspaceDependency = sourceManifests.get(dependencyName)
      if (workspaceDependency && dependencyVersion !== workspaceDependency.manifest.version) {
        throw new Error(
          `Packed ${manifest.name} resolved ${dependencyName} to ${String(dependencyVersion)} instead of ${workspaceDependency.manifest.version}`
        )
      }
    }
    console.log(`${manifest.name}@${manifest.version} packed consumer contract passed`)
  }
} finally {
  rmSync(packDirectory, { recursive: true, force: true })
}
