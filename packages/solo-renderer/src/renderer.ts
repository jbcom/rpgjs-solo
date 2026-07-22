import { installCanvasEnginePatches } from '@arcade-cabinet/rpgjs-patches'
import { Sprite, Viewport, bootstrapCanvas } from 'canvasengine'
import { resolveInitialMute, setSoloMuted } from './audio'
import { SoloKeyboardInput } from './input'
import { SoloRendererModel } from './model'
import { createSoloScene } from './scene'
import type { SoloRenderedMap, SoloRendererHandle, SoloRendererOptions } from './types'

export class SoloRenderer implements SoloRendererHandle {
  readonly model: SoloRendererModel
  readonly uiRoot: HTMLElement
  readonly fogController

  private readonly input: SoloKeyboardInput | null
  private application: any = null
  private canvasElement: { destroy?: () => void } | null = null
  private animationFrame: number | null = null
  private previousFrameTime: number | null = null
  private started = false
  private isMuted: boolean

  constructor(private readonly options: SoloRendererOptions) {
    installCanvasEnginePatches({ Sprite, Viewport })
    this.model = new SoloRendererModel(options)
    const scene = createSoloScene(this.model, options)
    this.fogController = scene.fogController
    this.sceneComponent = scene.component
    this.input = options.input === false
      ? null
      : new SoloKeyboardInput(options.runtime, options.playerId, options.input || {})
    this.isMuted = resolveInitialMute(options.audio, options.testMode)
    setSoloMuted(this.isMuted)

    this.uiRoot = document.createElement('div')
    this.uiRoot.className = 'rpgjs-solo-ui'
    this.uiRoot.dataset.rpgjsSoloUi = ''
    options.target.append(this.uiRoot)
  }

  private readonly sceneComponent

  get muted(): boolean {
    return this.isMuted
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted
    setSoloMuted(muted)
  }

  registerMap(map: SoloRenderedMap): void {
    this.model.registerMap(map)
  }

  async start(): Promise<void> {
    if (this.started) return
    const bootstrapOptions = {
      antialias: false,
      resolution: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
      autoDensity: true,
      ...this.options.bootstrap
    } as Parameters<typeof bootstrapCanvas>[2]
    const result = await bootstrapCanvas(this.options.target, this.sceneComponent, bootstrapOptions)
    this.application = result.app
    this.canvasElement = result.canvasElement
    this.input?.start()
    this.started = true
    this.animationFrame = requestAnimationFrame(this.frame)
  }

  stop(): void {
    if (!this.started) return
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame)
    this.animationFrame = null
    this.previousFrameTime = null
    this.input?.stop()
    this.started = false
  }

  destroy(): void {
    this.stop()
    this.model.dispose()
    this.canvasElement?.destroy?.()
    this.canvasElement = null
    this.application?.destroy(
      { removeView: true },
      { children: true, texture: true, textureSource: true, context: true }
    )
    this.application = null
    this.uiRoot.remove()
  }

  private readonly frame = (time: number): void => {
    const previous = this.previousFrameTime ?? time
    this.previousFrameTime = time
    this.options.runtime.step(time - previous)
    this.animationFrame = requestAnimationFrame(this.frame)
  }
}
