import { SoloRuntime } from '@jbcom/rpgjs-solo'
import { SoloRenderer, loadSoloTiledMap } from '@jbcom/rpgjs-solo-renderer'
import '@rpgjs/ui-css/index.css'
import '@rpgjs/ui-css/theme-default.css'
import './style.css'

const target = document.querySelector<HTMLElement>('#rpg')
if (!target) throw new Error('Missing #rpg mount point')

const runtime = new SoloRuntime()
const field = await loadSoloTiledMap({ id: 'field', basePath: '/maps' })
runtime.registerMap(field.runtime)
const startPositions = field.runtime.data?.startPositions as Record<string, { x: number; y: number }> | undefined
const start = startPositions?.start ?? { x: 64, y: 64 }

runtime.spawnEntity({ id: 'hero', kind: 'player', mapId: 'field', ...start, speed: 82 })
runtime.spawnEntity({
  id: 'warden',
  kind: 'npc',
  mapId: 'field',
  x: 136,
  y: 88,
  data: { name: 'Ash Warden' }
})

let message = 'Explore with arrows or WASD. Press Space to inspect.'
runtime.registerAction('interact', ({ entity }) => {
  message = entity.id === 'hero'
    ? 'The Ash Warden watches the sealed northern road.'
    : 'Nothing answers.'
})

const renderer = new SoloRenderer({
  runtime,
  target,
  playerId: 'hero',
  maps: [field],
  appearances: {
    hero: { color: '#f3d38a', width: 14 },
    warden: { color: '#9fc6d8', width: 16, visibleInFog: 'visible' }
  },
  fog: { radius: 70, tileSize: 8 },
  audio: { autoMuteInTests: true }
})

const panel = document.createElement('section')
panel.className = 'proof-panel rpg-ui-panel'
panel.innerHTML = `
  <strong>RPGJS Solo</strong>
  <span data-status></span>
  <small data-message></small>
  <button class="rpg-ui-btn" type="button" data-mute>Mute</button>
`
renderer.uiRoot.append(panel)

const status = panel.querySelector<HTMLElement>('[data-status]')!
const messageElement = panel.querySelector<HTMLElement>('[data-message]')!
const muteButton = panel.querySelector<HTMLButtonElement>('[data-mute]')!
const renderHud = () => {
  const hero = runtime.getEntity('hero')!
  status.textContent = `tick ${runtime.tick} · ${Math.round(hero.position.x)}, ${Math.round(hero.position.y)}`
  messageElement.textContent = message
  muteButton.textContent = renderer.muted ? 'Unmute' : 'Mute'
}

muteButton.addEventListener('click', () => {
  renderer.setMuted(!renderer.muted)
  renderHud()
})
runtime.subscribe((event) => {
  if (event.type === 'tick' || event.type === 'command') renderHud()
})

await renderer.start()
renderHud()

Object.assign(window, { __RPGJS_SOLO__: { runtime, renderer } })
