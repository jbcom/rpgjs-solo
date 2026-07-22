import { Sprite, h, tick, type ComponentFunction } from 'canvasengine'
import { Texture } from 'pixi.js'
import type {
  SoloFogOptions,
  SoloFogVisibilityProvider
} from './types'

const DEFAULT_UNKNOWN: [number, number, number, number] = [5, 7, 14, 1]
const DEFAULT_EXPLORED: [number, number, number, number] = [12, 16, 28, 0.72]

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value))

const rgba = (
  color: [number, number, number, number] | undefined,
  fallback: [number, number, number, number]
): [number, number, number, number] => {
  const source = color ?? fallback
  const channel = (value: number): number => Number.isFinite(value)
    ? value >= 0 && value <= 1 ? Math.round(value * 255) : clamp(Math.round(value), 0, 255)
    : 0
  const alpha = Number.isFinite(source[3])
    ? source[3] >= 0 && source[3] <= 1
      ? Math.round(source[3] * 255)
      : clamp(Math.round(source[3]), 0, 255)
    : 255
  return [channel(source[0]), channel(source[1]), channel(source[2]), alpha]
}

interface AuthoredFogProps {
  provider: SoloFogVisibilityProvider
  options: SoloFogOptions
  worldWidth: () => number
  worldHeight: () => number
}

const AuthoredFog = (props: AuthoredFogProps) => {
  if (typeof document === 'undefined') {
    throw new Error('AuthoredFog: document is undefined, canvas cannot be created.')
  }
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (!context) throw new Error('AuthoredFog: unable to create 2D context for fog canvas.')
  const texture = Texture.from(canvas)
  let lastKey = ''

  const redraw = (): void => {
    const snapshot = props.provider()
    if (!snapshot) return
    const width = Math.max(1, Math.floor(snapshot.width))
    const height = Math.max(1, Math.floor(snapshot.height))
    const key = `${snapshot.mapId}:${width}x${height}:${snapshot.tileSize}:${snapshot.revision}`
    if (key === lastKey) return
    lastKey = key
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const pixels = context.createImageData(width, height)
    const unknown = rgba(props.options.unknownColor, DEFAULT_UNKNOWN)
    const explored = rgba(props.options.exploredColor, DEFAULT_EXPLORED)
    for (let tileY = 0; tileY < height; tileY += 1) {
      for (let tileX = 0; tileX < width; tileX += 1) {
        const state = snapshot.stateAt(tileX, tileY)
        if (state === 'visible') continue
        const color = state === 'explored' ? explored : unknown
        const offset = (tileY * width + tileX) * 4
        pixels.data[offset] = color[0]
        pixels.data[offset + 1] = color[1]
        pixels.data[offset + 2] = color[2]
        pixels.data[offset + 3] = color[3]
      }
    }
    context.putImageData(pixels, 0, 0)
    texture.source.scaleMode = props.options.smooth === false ? 'nearest' : 'linear'
    texture.source.update()
  }

  redraw()
  tick(() => redraw())
  return h(Sprite, {
    texture,
    x: 0,
    y: 0,
    width: props.worldWidth,
    height: props.worldHeight,
    zIndex: 1_000_000,
    roundPixels: true
  } as never)
}

export const createAuthoredFogElement = (
  provider: SoloFogVisibilityProvider,
  options: SoloFogOptions,
  worldWidth: () => number,
  worldHeight: () => number
) => h(AuthoredFog as ComponentFunction, { provider, options, worldWidth, worldHeight } as never)
