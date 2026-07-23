import { Container, effect, h, mount, type ComponentFunction } from 'canvasengine'
import type { SoloCameraOptions, SoloViewportSize } from './types'

interface CameraContext {
  canvasSize?: () => SoloViewportSize
  viewport?: {
    setZoom(scale: number, center?: boolean): unknown
  }
}

export const resolveSoloCameraZoom = (
  options: SoloCameraOptions,
  size: SoloViewportSize
): number => {
  const zoom = typeof options.zoom === 'function' ? options.zoom(size) : options.zoom
  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new RangeError(`Solo camera zoom must be a positive finite number; received ${zoom}`)
  }
  return zoom
}

/** Applies a game-owned fixed or responsive zoom to the active keyed viewport. */
export const createSoloCameraElement = (options: SoloCameraOptions) => {
  const Camera: ComponentFunction = () => {
    mount((element) => {
      const context = element.props.context as CameraContext
      if (!context.viewport || !context.canvasSize) {
        throw new Error('Solo camera requires a mounted CanvasEngine viewport context')
      }
      const zoomEffect = effect(() => {
        const size = context.canvasSize!()
        context.viewport!.setZoom(
          resolveSoloCameraZoom(options, size),
          options.center !== false
        )
      })
      return () => zoomEffect.subscription?.unsubscribe()
    })
    return h(Container)
  }

  return h(Camera)
}
