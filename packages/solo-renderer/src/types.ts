import type { TiledMap } from '@canvasengine/tiled'
import type { SoloEntityState, SoloMapDefinition, SoloRuntime } from '@jbcom/rpgjs-solo'

export interface SoloRenderedMap {
  id: string
  /**
   * Changes whenever the rendered Tiled layers change without changing maps.
   * The renderer uses it to retire the old scene only after a replacement map
   * has been registered.
   */
  revision?: number
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
  /**
   * Selects the spritesheet animation from authoritative Solo entity state.
   * A fixed string is useful for props; a resolver lets games project combat,
   * interaction, or defeat state without teaching the renderer game rules.
   */
  animation?: string | SoloEntityAnimationResolver
  color?: string
  width?: number
  height?: number
  anchor?: [number, number]
  zOffset?: number
  visibleInFog?: 'always' | 'visible' | 'explored'
}

export type SoloEntityAnimationResolver = (entity: SoloEntityState) => string
export type SoloAppearanceResolver = (entity: SoloEntityState) => SoloEntityAppearance | undefined

export type SoloFogVisibilityState = 'visible' | 'explored' | 'unknown'

/**
 * Immutable view of game-authored fog for the active map. The game owns
 * exploration and persistence; the renderer only samples and displays it.
 * Increment `revision` whenever `stateAt` can return a different value.
 */
export interface SoloFogVisibilitySnapshot {
  mapId: string
  width: number
  height: number
  tileSize: number
  revision: number
  stateAt(tileX: number, tileY: number): SoloFogVisibilityState
}

export type SoloFogVisibilityProvider = () => SoloFogVisibilitySnapshot | null

export interface SoloFogController {
  version(): number
  clarityAt(x: number, y: number): number
  isVisibleAt(x: number, y: number, threshold?: number): boolean
  isExploredAt(x: number, y: number): boolean
  stateAt(x: number, y: number, clearThreshold?: number): SoloFogVisibilityState
}

export interface SoloFogOptions {
  tileSize?: number
  radius?: number
  smooth?: boolean
  renderScale?: number
  edgeSoftness?: number
  updateHz?: number
  unknownColor?: [number, number, number, number]
  exploredColor?: [number, number, number, number]
  /**
   * Supplies occlusion-aware, persistable fog state owned by the game. When
   * omitted, the renderer uses CanvasEngine's radial vision preset.
   */
  visibility?: SoloFogVisibilityProvider
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

export interface SoloViewportSize {
  width: number
  height: number
}

export interface SoloCameraOptions {
  /**
   * World-to-screen scale for the active viewport. A resolver is re-evaluated
   * when CanvasEngine reports a new canvas size, including orientation changes.
   */
  zoom: number | ((viewport: SoloViewportSize) => number)
  /** Keep the current viewport center stable while applying zoom. Defaults to true. */
  center?: boolean
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
  camera?: SoloCameraOptions
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
