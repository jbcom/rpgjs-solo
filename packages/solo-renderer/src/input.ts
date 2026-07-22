import type { SoloRuntime, SoloVector } from '@jbcom/rpgjs-solo'
import type { SoloInputOptions } from './types'

const DIRECTION_KEYS: Record<string, SoloVector> = {
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 }
}

const UI_INPUT_SELECTOR = [
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="dialog"]',
  '[data-solo-input-owner]'
].join(',')

/** UI overlays own keyboard events they already handled or received inside an interactive surface. */
const uiOwnsEvent = (event: KeyboardEvent): boolean => {
  if (event.defaultPrevented) return true
  if (typeof Element === 'undefined') return false
  const path = event.composedPath?.() ?? [event.target]
  return path.some((target) => target instanceof Element && target.closest(UI_INPUT_SELECTOR) !== null)
}

export class SoloKeyboardInput {
  private readonly held = new Set<string>()
  private listening = false

  constructor(
    private readonly runtime: SoloRuntime,
    private readonly playerId: string,
    private readonly options: SoloInputOptions = {}
  ) {}

  start(): void {
    if (this.listening || this.options.enabled === false || typeof document === 'undefined') return
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    this.listening = true
  }

  stop(): void {
    if (!this.listening || typeof document === 'undefined') return
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.onBlur()
    this.listening = false
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (uiOwnsEvent(event)) return
    if (DIRECTION_KEYS[event.code]) {
      this.held.add(event.code)
      this.dispatchMovement()
      if (this.options.preventDefault !== false) event.preventDefault()
      return
    }
    if ((this.options.actionKeys ?? ['Space', 'Enter']).includes(event.code) && !event.repeat) {
      this.runtime.dispatch({ type: 'action', entityId: this.playerId, action: 'interact', source: 'human' })
      if (this.options.preventDefault !== false) event.preventDefault()
      return
    }
    if ((this.options.pauseKeys ?? ['Escape']).includes(event.code) && !event.repeat) {
      if (this.runtime.paused) this.runtime.resume()
      else this.runtime.pause()
      if (this.options.preventDefault !== false) event.preventDefault()
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (!DIRECTION_KEYS[event.code]) return
    this.held.delete(event.code)
    this.dispatchMovement()
    if (this.options.preventDefault !== false) event.preventDefault()
  }

  private readonly onBlur = (): void => {
    this.held.clear()
    this.runtime.dispatch({ type: 'stop', entityId: this.playerId, source: 'human' })
  }

  private dispatchMovement(): void {
    const vector = [...this.held].reduce<SoloVector>((sum, key) => {
      const direction = DIRECTION_KEYS[key]
      return direction ? { x: sum.x + direction.x, y: sum.y + direction.y } : sum
    }, { x: 0, y: 0 })
    if (vector.x === 0 && vector.y === 0) {
      this.runtime.dispatch({ type: 'stop', entityId: this.playerId, source: 'human' })
      return
    }
    this.runtime.dispatch({ type: 'move', entityId: this.playerId, vector, source: 'human' })
  }
}
