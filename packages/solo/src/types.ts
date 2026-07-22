export type SoloJsonPrimitive = boolean | number | string | null
export type SoloJsonValue = SoloJsonPrimitive | SoloJsonValue[] | { [key: string]: SoloJsonValue }

export interface SoloVector {
  x: number
  y: number
}

export type SoloDirection = 'idle' | 'up' | 'down' | 'left' | 'right'
export type SoloEntityKind = 'player' | 'npc' | 'event' | 'projectile'
export type SoloCommandSource = 'human' | 'ai' | 'replay' | 'system'

export type SoloHitbox =
  | number
  | { radius: number }
  | { width: number; height: number }
  | { type: 'circle'; radius: number }
  | { type: 'box' | 'aabb'; width: number; height: number }
  | { type: 'capsule'; radius: number; height: number }

export interface SoloStats {
  hp: number
  maxHp: number
  sp: number
  maxSp: number
  level: number
  experience: number
  gold: number
  attributes: Record<string, number>
}

export interface SoloEntityDefinition {
  id: string
  kind: SoloEntityKind
  mapId: string
  x: number
  y: number
  hitbox?: SoloHitbox
  speed?: number
  direction?: SoloDirection
  stats?: Partial<SoloStats>
  data?: Record<string, SoloJsonValue>
}

/**
 * The one gameplay-authoritative entity object. The runtime mutates this object
 * in place so renderers, UI, combat, AI, and saves all observe the same identity.
 */
export interface SoloEntityState {
  id: string
  kind: SoloEntityKind
  mapId: string
  position: SoloVector
  velocity: SoloVector
  direction: SoloDirection
  moving: boolean
  hitbox: SoloHitbox
  speed: number
  stats: SoloStats
  data: Record<string, SoloJsonValue>
}

export interface SoloObstacleDefinition {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface SoloMapDefinition {
  id: string
  width: number
  height: number
  tileWidth?: number
  tileHeight?: number
  obstacles?: readonly SoloObstacleDefinition[]
  entities?: readonly Omit<SoloEntityDefinition, 'mapId'>[]
  data?: Record<string, SoloJsonValue>
}

interface SoloCommandBase {
  source?: SoloCommandSource
}

export type SoloCommand =
  | (SoloCommandBase & {
      type: 'move'
      entityId: string
      vector: SoloVector
      speed?: number
    })
  | (SoloCommandBase & {
      type: 'stop'
      entityId: string
    })
  | (SoloCommandBase & {
      type: 'teleport'
      entityId: string
      position: SoloVector
    })
  | (SoloCommandBase & {
      type: 'transfer-map'
      entityId: string
      mapId: string
      position: SoloVector
    })
  | (SoloCommandBase & {
      type: 'action'
      entityId: string
      action: string
      payload?: SoloJsonValue
    })

export interface SoloCommandRecord {
  tick: number
  source: SoloCommandSource
  command: SoloCommand
}

export interface SoloCommandResult {
  accepted: boolean
  tick: number
  reason?: string
}

export interface SoloRuntimeOptions {
  fixedStepMs?: number
  maxFrameDeltaMs?: number
  maxStepsPerFrame?: number
}

export interface SoloRuntimeView {
  tick: number
  paused: boolean
  activeMapId: string | null
  entities: readonly SoloEntityState[]
}

export type SoloRuntimeEvent =
  | { type: 'command'; record: SoloCommandRecord }
  | { type: 'tick'; view: SoloRuntimeView }
  | { type: 'pause'; paused: boolean }
  | { type: 'active-map'; mapId: string }
  | { type: 'entity-spawned'; entity: SoloEntityState }
  | { type: 'entity-removed'; entityId: string }
  | { type: 'entity-transferred'; entity: SoloEntityState; fromMapId: string }
  | { type: 'restored'; view: SoloRuntimeView }

export interface SoloEntitySnapshot extends SoloEntityDefinition {
  velocity: SoloVector
}

export interface SoloRuntimeSnapshot {
  schema: 'rpgjs-solo-save'
  version: 1
  tick: number
  paused: boolean
  activeMapId: string | null
  entities: SoloEntitySnapshot[]
}

export interface SoloActionContext {
  entity: SoloEntityState
  payload: SoloJsonValue | undefined
  source: SoloCommandSource
}

export type SoloActionHandler = (context: SoloActionContext) => void
export type SoloRuntimeListener = (event: SoloRuntimeEvent) => void
