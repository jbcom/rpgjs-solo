import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const bundlePath = join(packageRoot, 'dist/index.js')
const packagePath = join(packageRoot, 'package.json')
const bundle = readFileSync(bundlePath, 'utf8')
const manifest = JSON.parse(readFileSync(packagePath, 'utf8'))

const banned = [
  '@signe/room',
  '@signe/sync',
  'partysocket',
  'WebSocket',
  'PredictionController',
  'DeterministicInputBuffer',
  'socket.io',
  'node:http',
  'node:https'
]

for (const term of banned) {
  if (bundle.includes(term)) throw new Error(`Solo production bundle contains banned term: ${term}`)
}

if (/^\s*import\s/m.test(bundle)) {
  throw new Error('Solo production bundle contains an external runtime import')
}

if ('dependencies' in manifest && Object.keys(manifest.dependencies).length > 0) {
  throw new Error('Solo production package must not ship runtime dependencies yet')
}

const maxBytes = 225_000
const bundleBytes = statSync(bundlePath).size
if (bundleBytes > maxBytes) {
  throw new Error(`Solo production bundle is ${bundleBytes} bytes; limit is ${maxBytes}`)
}

console.log(`Solo boundary PASS: ${bundleBytes} bytes, zero runtime imports, zero runtime dependencies`)
