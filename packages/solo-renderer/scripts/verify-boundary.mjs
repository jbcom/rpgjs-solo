import { readFile, stat } from 'node:fs/promises'

const bundlePath = new URL('../dist/index.js', import.meta.url)
const source = await readFile(bundlePath, 'utf8')
const { size } = await stat(bundlePath)
const banned = ['@signe/room', '@signe/sync', 'WebSocket', 'PredictionController', 'socket.io', "from 'pixi.js'"]
const violations = banned.filter((term) => source.includes(term))

if (violations.length > 0) {
  throw new Error(`Solo renderer boundary contains banned terms: ${violations.join(', ')}`)
}
if (size > 40_000) throw new Error(`Solo renderer entry is ${size} bytes; expected at most 40000`)

console.log(`Solo renderer boundary passed: ${size} bytes, no transport or public Pixi imports`)
