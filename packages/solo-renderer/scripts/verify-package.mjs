import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const publishGuard = join(packageDirectory, 'scripts', 'require-pnpm-publish.mjs')
const packageJson = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'))

execFileSync(process.execPath, [publishGuard], {
  env: { ...process.env, npm_config_user_agent: 'pnpm/11.16.0' },
  stdio: 'pipe'
})

let rejectedNpm = false
try {
  execFileSync(process.execPath, [publishGuard], {
    env: { ...process.env, npm_config_user_agent: 'npm/11.0.0' },
    stdio: 'pipe'
  })
} catch {
  rejectedNpm = true
}
if (!rejectedNpm) throw new Error('The Solo renderer publish guard accepted npm publish')

const packDirectory = mkdtempSync(join(tmpdir(), 'rpgjs-solo-renderer-pack-'))
try {
  execFileSync('pnpm', ['pack', '--pack-destination', packDirectory], {
    cwd: packageDirectory,
    stdio: 'pipe'
  })
  const archive = readdirSync(packDirectory).find((name) => name.endsWith('.tgz'))
  if (!archive) throw new Error('pnpm pack did not create a Solo renderer archive')
  const packedManifest = JSON.parse(
    execFileSync('tar', ['-xOf', join(packDirectory, archive), 'package/package.json'], {
      encoding: 'utf8'
    })
  )
  const packedCore = packedManifest.dependencies?.['@jbcom/rpgjs-solo']
  if (packedCore !== '5.0.0-beta.26.solo.3') {
    throw new Error(`Packed Solo core dependency was ${String(packedCore)}`)
  }
  if (JSON.stringify(packedManifest).includes('workspace:')) {
    throw new Error('Packed Solo renderer manifest still contains a workspace protocol')
  }
  if (packedManifest.version !== packageJson.version) {
    throw new Error('Packed Solo renderer version does not match its source manifest')
  }
  console.log(
    `Solo renderer package contract passed: ${packedManifest.version} -> core ${packedCore}`
  )
} finally {
  rmSync(packDirectory, { recursive: true, force: true })
}
