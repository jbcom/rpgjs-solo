import type { TiledMap } from '@canvasengine/tiled'
import type { SoloEntityState, SoloMapDefinition, SoloRuntime } from '@jbcom/rpgjs-solo'

export interface SoloRenderedMap {
  id: string
  basePath: string
  parsedMap: TiledMap
  runtime: SoloMapDefinition
}

export interface SoloSpritesheetDefinition {
  image: string
  width?: number
  height?: number
  framesWidth?: number
  framesHeight?: number
  rectWidth?: number
  rectHeight?: number
  anchor?: number[]
  scale?: number[]
  textures?: Record<string, unknown>
  [key: string]: unknown
}

export interface SoloEntityAppearance {
  spritesheet?: SoloSpritesheetDefinition
  color?: string
  width?: number
  height?: number
  anchor?: [number, number]
  zOffset?: number
  visibleInFog?: 'always' | 'visible' | 'explored'
}

export type SoloAppearanceResolver = (entity: SoloEntityState) => SoloEntityAppearance | undefined

export interface SoloFogOptions {
  tileSize?: number
  radius?: number
  smooth?: boolean
  renderScale?: number
  edgeSoftness?: number
  updateHz?: number
  unknownColor?: [number, number, number, number]
  exploredColor?: [number, number, number, number]
}

export interface SoloInputOptions {
  enabled?: boolean
  actionKeys?: readonly string[]
  pauseKeys?: readonly string[]
  preventDefault?: boolean
}

export interface SoloAudioOptions {
  muted?: boolean
  autoMuteInTests?: boolean
}

export interface SoloRendererOptions {
  runtime: SoloRuntime
  target: HTMLElement
  playerId: string
  maps: readonly SoloRenderedMap[]
  appearances?: Record<string, SoloEntityAppearance>
  resolveAppearance?: SoloAppearanceResolver
  width?: number | `${number}%`
  height?: number | `${number}%`
  background?: string
  fog?: false | SoloFogOptions
  input?: false | SoloInputOptions
  audio?: SoloAudioOptions
  testMode?: boolean
  bootstrap?: Record<string, unknown>
}

export interface SoloRendererHandle {
  readonly uiRoot: HTMLElement
  readonly muted: boolean
  setMuted(muted: boolean): void
  start(): Promise<void>
  stop(): void
  destroy(): void
}
