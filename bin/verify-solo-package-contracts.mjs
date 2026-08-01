import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  inspectPortablePackageArchive,
  packPackageArchive
} from './package-archive-contracts.mjs'

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const publishGuard = join(rootDirectory, 'bin', 'require-pnpm-publish.mjs')
const rootManifest = JSON.parse(readFileSync(join(rootDirectory, 'package.json'), 'utf8'))
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
      npm_config_user_agent: rootManifest.packageManager.replace('@', '/'),
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
    const { archivePath } = packPackageArchive({
      packageDirectory: directory,
      destinationDirectory: packageDirectory
    })
    const { packedManifest } = inspectPortablePackageArchive({
      archivePath,
      extractDirectory: join(packageDirectory, 'extract'),
      packageName: manifest.name
    })
    if (packedManifest.version !== manifest.version) {
      throw new Error(`Packed ${manifest.name} version does not match its source manifest`)
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
