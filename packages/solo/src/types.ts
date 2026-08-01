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
  /** Prevent physics collisions and movement commands from displacing the entity. */
  immovable?: boolean
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
  immovable: boolean
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
      /** Respect authored map obstacles by default; scripted transitions may opt out explicitly. */
      collision?: 'respect' | 'ignore'
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

export interface SoloCommandRejection {
  accepted: false
  reason: string
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

export interface SoloCandidateSafeRegistration {
  /**
   * Explicitly attest that the handler reads and mutates candidate-owned input
   * only and performs no persistence, UI, audio, telemetry, or other egress.
   */
  candidateSafe?: boolean
}

export type SoloActionHandler = (context: SoloActionContext) => void | SoloCommandRejection
export type SoloCommandInterceptor = (
  command: SoloCommand,
  entity: SoloEntityState,
  source: SoloCommandSource
) => void | SoloCommandRejection
export type SoloRuntimeListener = (event: SoloRuntimeEvent) => void

export type SoloDeepReadonly<T> =
  T extends SoloJsonPrimitive ? T
    : T extends readonly (infer TValue)[] ? readonly SoloDeepReadonly<TValue>[]
      : T extends object ? { readonly [TKey in keyof T]: SoloDeepReadonly<T[TKey]> }
        : never

/** A game-owned event staged beside one isolated Rules candidate tick. */
export interface SoloDomainEvent<TPayload extends SoloJsonValue = SoloJsonValue> {
  id: string
  type: string
  tick: number
  payload: TPayload
}

/** Pure application reducer for Narrative, Agency, quest, or other JSON state. */
export type SoloDomainReducer<
  TState extends SoloJsonValue,
  TEvent extends SoloDomainEvent = SoloDomainEvent
> = (
  state: SoloDeepReadonly<TState>,
  event: SoloDeepReadonly<TEvent>
) => TState

export interface SoloCandidateTickOptions<TState extends SoloJsonValue> {
  /** Stable caller-owned identity used by receipts and diagnostics. */
  id: string
  /** Game-owned JSON state reduced in the same isolated candidate as Rules. */
  state: TState
  /** Optional optimistic concurrency check against the current committed tick. */
  expectedBaseTick?: number
}

export type SoloCandidateTickStatus = 'active' | 'failed' | 'aborted' | 'committed'

/** One immutable publication; no command, tick, or domain event escapes before it. */
export interface SoloCandidateTickPublication<TState extends SoloJsonValue = SoloJsonValue> {
  id: string
  baseTick: number
  tick: number
  state: SoloDeepReadonly<TState>
  view: SoloRuntimeView
  runtimeEvents: readonly SoloRuntimeEvent[]
  domainEvents: readonly SoloDeepReadonly<SoloDomainEvent>[]
}

export type SoloCandidateTickListener = (publication: SoloCandidateTickPublication) => void

export interface SoloCandidateTickNotificationError {
  candidateId: string
  tick: number
  phase: 'candidate-publication' | 'legacy-runtime-event'
  runtimeEventType?: SoloRuntimeEvent['type']
  error: unknown
}

export type SoloCandidateTickErrorListener = (failure: SoloCandidateTickNotificationError) => void
