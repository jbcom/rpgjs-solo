import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const packageDirectories = [
  'packages/solo',
  'packages/solo-action-battle',
  'packages/solo-renderer',
  'packages/solo-vite'
]
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'rpgjs-solo-packed-consumer-'))
const packDirectory = join(temporaryDirectory, 'packs')
const consumerDirectory = join(temporaryDirectory, 'consumer')
const storeDirectory = join(temporaryDirectory, 'pnpm-store')

const run = (command, arguments_, options = {}) =>
  execFileSync(command, arguments_, {
    cwd: consumerDirectory,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options
  })

try {
  mkdirSync(packDirectory)
  mkdirSync(consumerDirectory)

  const dependencies = {
    '@types/react': '19.2.17',
    'pixi.js': '8.19.0',
    react: '19.2.8',
    typescript: '7.0.2',
    vite: '8.2.1'
  }
  const localPackageOverrides = {}

  for (const relativeDirectory of packageDirectories) {
    const directory = join(rootDirectory, relativeDirectory)
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    const destination = join(packDirectory, manifest.name.replaceAll('/', '-'))
    mkdirSync(destination)
    execFileSync('pnpm', ['pack', '--pack-destination', destination], {
      cwd: directory,
      stdio: 'pipe'
    })
    const archive = readdirSync(destination).find((name) => name.endsWith('.tgz'))
    if (!archive) throw new Error(`pnpm pack did not create an archive for ${manifest.name}`)
    const archiveReference = `file:${relative(consumerDirectory, join(destination, archive))}`
    dependencies[manifest.name] = archiveReference
    localPackageOverrides[manifest.name] = archiveReference
  }

  writeFileSync(
    join(consumerDirectory, 'package.json'),
    `${JSON.stringify({
      name: 'rpgjs-solo-packed-consumer',
      private: true,
      type: 'module',
      scripts: {
        build: 'vite build',
        check: 'tsc --noEmit',
        start: 'node runtime-check.mjs'
      },
      dependencies
    }, null, 2)}\n`
  )
  writeFileSync(
    join(consumerDirectory, 'pnpm-workspace.yaml'),
    `packages:
  - .
overrides:
${Object.entries(localPackageOverrides)
  .map(([name, archive]) => `  ${JSON.stringify(name)}: ${JSON.stringify(archive)}`)
  .join('\n')}
`
  )
  writeFileSync(
    join(consumerDirectory, 'tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: {
        target: 'ES2023',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        lib: ['ES2023', 'DOM'],
        strict: true,
        noEmit: true,
        skipLibCheck: true
      },
      include: ['src', 'vite.config.ts']
    }, null, 2)}\n`
  )
  writeFileSync(
    join(consumerDirectory, 'index.html'),
    '<!doctype html><html><body><main id="app"></main><script type="module" src="/src/main.ts"></script></body></html>\n'
  )
  writeFileSync(
    join(consumerDirectory, 'vite.config.ts'),
    `import { defineConfig } from 'vite'
import { rpgjsSoloBoundary } from '@jbcom/rpgjs-solo-vite'

export default defineConfig({
  plugins: [rpgjsSoloBoundary()]
})
`
  )
  mkdirSync(join(consumerDirectory, 'src'))
  writeFileSync(
    join(consumerDirectory, 'src', 'main.ts'),
    `import { SoloRuntime } from '@jbcom/rpgjs-solo'
import { SoloActionBattle } from '@jbcom/rpgjs-solo-action-battle'
import { resolveInitialMute } from '@jbcom/rpgjs-solo-renderer'

const runtime = new SoloRuntime({ fixedStepMs: 16 })
runtime.registerMap({
  id: 'packed-field',
  width: 128,
  height: 128,
  entities: [{ id: 'hero', kind: 'player', x: 32, y: 32 }]
})
runtime.setActiveMap('packed-field')
const candidate = runtime.beginCandidateTick({
  id: 'packed-readonly-contract',
  state: { journal: { count: 0 } }
})
candidate.dispatch({ type: 'stop', entityId: 'hero', source: 'ai' })
const candidateView = candidate.getView()
const candidateEntity = candidate.getEntity('hero')!
const candidateMap = candidate.getMap('packed-field')!
const candidateLog = candidate.getCommandLog()
const publication = candidate.commit()

if (false) {
  // @ts-expect-error candidate views are deeply readonly
  candidateView.entities[0]!.stats.hp = 0
  // @ts-expect-error candidate entity inspection is deeply readonly
  candidateEntity.position.x = 0
  // @ts-expect-error candidate map inspection is deeply readonly
  candidateMap.width = 0
  // @ts-expect-error candidate command records and commands are deeply readonly
  candidateLog[0]!.command.entityId = 'other'
  // @ts-expect-error publication scalar fields are readonly
  publication.tick = 2
  // @ts-expect-error publication views are deeply readonly
  publication.view.entities[0]!.data.changed = true
  // @ts-expect-error publication event elements are deeply readonly
  publication.runtimeEvents[0]!.type = 'pause'
  // @ts-expect-error publication domain event elements are deeply readonly
  publication.domainEvents[0]!.tick = 2
  // @ts-expect-error publication game-owned state is deeply readonly
  publication.state.journal.count = 1
}
const combat = new SoloActionBattle(runtime)

if (runtime.getEntity('hero')?.mapId !== 'packed-field') throw new Error('Solo runtime map execution failed')
if (combat.canMove('hero').available !== true) throw new Error('Solo action battle execution failed')
if (resolveInitialMute({ autoMuteInTests: true }, true) !== true) throw new Error('Solo test mute failed')

document.querySelector('#app')!.textContent = 'packed Solo consumer passed'
`
  )
  writeFileSync(
    join(consumerDirectory, 'runtime-check.mjs'),
    `import { SoloRuntime } from '@jbcom/rpgjs-solo'
import { SoloActionBattle } from '@jbcom/rpgjs-solo-action-battle'
import { inspectSoloBundle } from '@jbcom/rpgjs-solo-vite'

const runtime = new SoloRuntime({ fixedStepMs: 16 })
runtime.registerMap({
  id: 'packed-field',
  width: 128,
  height: 128,
  entities: [{ id: 'hero', kind: 'player', x: 32, y: 32 }]
})
runtime.setActiveMap('packed-field')
const candidate = runtime.beginCandidateTick({
  id: 'packed-runtime-freeze',
  state: { journal: { count: 0 } }
})
candidate.dispatch({ type: 'stop', entityId: 'hero', source: 'ai' })
const candidateView = candidate.getView()
const candidateLog = candidate.getCommandLog()
if (!Object.isFrozen(candidateView)
  || !Object.isFrozen(candidateView.entities)
  || !Object.isFrozen(candidateView.entities[0])
  || !Object.isFrozen(candidateLog)
  || !Object.isFrozen(candidateLog[candidateLog.length - 1]?.command)) {
  throw new Error('Solo candidate inspection surfaces are not deeply frozen')
}
const publication = candidate.commit()
if (!Object.isFrozen(publication)
  || !Object.isFrozen(publication.view)
  || !Object.isFrozen(publication.view.entities[0])
  || !Object.isFrozen(publication.runtimeEvents)
  || !Object.isFrozen(publication.runtimeEvents[0])
  || !Object.isFrozen(publication.state.journal)) {
  throw new Error('Solo candidate publication is not deeply frozen')
}
const combat = new SoloActionBattle(runtime)
const fakeBundle = {
  'entry.js': {
    type: 'chunk',
    fileName: 'entry.js',
    code: 'export const packed = true',
    isEntry: true
  }
}

if (runtime.getEntity('hero')?.mapId !== 'packed-field') throw new Error('Solo runtime map execution failed')
if (combat.canMove('hero').available !== true) throw new Error('Solo action battle execution failed')
if (inspectSoloBundle(fakeBundle).length !== 0) throw new Error('Solo Vite boundary rejected a clean bundle')
console.log('RPGJS Solo packed runtime execution and browser build passed')
`
  )

  run('pnpm', [
    'install',
    `--store-dir=${storeDirectory}`,
    '--registry=https://registry.npmjs.org/'
  ])
  run('pnpm', ['run', 'check'])
  run('pnpm', ['run', 'build'])
  process.stdout.write(run('pnpm', ['run', 'start']))
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
