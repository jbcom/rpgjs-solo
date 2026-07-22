import { readFile, stat } from 'node:fs/promises'

const bundlePath = new URL('../dist/index.js', import.meta.url)
const packagePath = new URL('../package.json', import.meta.url)
const bundle = await readFile(bundlePath, 'utf8')
const manifest = JSON.parse(await readFile(packagePath, 'utf8'))
const { size } = await stat(bundlePath)

const banned = [
  '@rpgjs/server',
  '@rpgjs/client',
  '@signe/room',
  '@signe/sync',
  'partysocket',
  'WebSocket',
  'Date.now',
  'setTimeout',
  'Math.random',
  'socket.io'
]
const violations = banned.filter((term) => bundle.includes(term))
if (violations.length > 0) {
  throw new Error(`Solo action-battle boundary contains banned terms: ${violations.join(', ')}`)
}
const dependencies = Object.keys(manifest.dependencies ?? {})
if (dependencies.length !== 1 || dependencies[0] !== '@jbcom/rpgjs-solo') {
  throw new Error(`Solo action-battle must depend only on @jbcom/rpgjs-solo; found ${dependencies.join(', ')}`)
}
if (size > 75_000) throw new Error(`Solo action-battle entry is ${size} bytes; expected at most 75000`)

console.log(`Solo action-battle boundary PASS: ${size} bytes, core-only runtime dependency`)
