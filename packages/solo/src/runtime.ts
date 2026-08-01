import { PhysicsEngine, type Entity, type RPGHitbox } from '@rpgjs/physic'
import type {
  SoloActionHandler,
  SoloCandidateTickListener,
  SoloCandidateTickErrorListener,
  SoloCandidateTickNotificationError,
  SoloCandidateTickOptions,
  SoloCandidateTickPublication,
  SoloCandidateTickStatus,
  SoloCommand,
  SoloCommandRecord,
  SoloCommandResult,
  SoloCommandInterceptor,
  SoloCommandSource,
  SoloCandidateSafeRegistration,
  SoloDirection,
  SoloDomainEvent,
  SoloDomainReducer,
  SoloDeepReadonly,
  SoloEntityDefinition,
  SoloEntitySnapshot,
  SoloEntityState,
  SoloJsonValue,
  SoloMapDefinition,
  SoloObstacleDefinition,
  SoloRuntimeEvent,
  SoloRuntimeListener,
  SoloRuntimeOptions,
  SoloRuntimeSnapshot,
  SoloRuntimeView,
  SoloStats,
  SoloVector
} from './types'

const DEFAULT_FIXED_STEP_MS = 1000 / 60
const DEFAULT_MAX_FRAME_DELTA_MS = 250
const DEFAULT_MAX_STEPS_PER_FRAME = 5
const DEFAULT_HITBOX = 16
const DEFAULT_SPEED = 96
const MAP_OBSTACLE_COLLISION_CATEGORY = 0x00000001
const ACTOR_COLLISION_CATEGORY = 0x00000002
const PROJECTILE_COLLISION_CATEGORY = 0x00000004

interface SoloMapRuntime {
  definition: SoloMapDefinition
  physics: PhysicsEngine
  obstacleEntities: Map<string, Entity>
}

const cloneJson = <T extends SoloJsonValue | Record<string, SoloJsonValue>>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T

const cloneStrictJson = <T extends SoloJsonValue>(value: T, seen = new WeakSet<object>()): T => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SoloRuntimeError('Candidate JSON numbers must be finite')
    return value
  }
  if (typeof value !== 'object') throw new SoloRuntimeError('Candidate state must contain JSON values only')
  if (seen.has(value)) throw new SoloRuntimeError('Candidate state must not contain cycles')
  seen.add(value)
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) {
      throw new SoloRuntimeError('Candidate state arrays must not be sparse or contain named properties')
    }
    const copy = value.map((entry) => cloneStrictJson(entry, seen))
    seen.delete(value)
    return copy as T
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new SoloRuntimeError('Candidate state must contain plain JSON objects only')
  }
  const copy: Record<string, SoloJsonValue> = {}
  for (const key of Object.keys(value).sort()) {
    copy[key] = cloneStrictJson((value as Record<string, SoloJsonValue>)[key], seen)
  }
  seen.delete(value)
  return copy as T
}

const deepFreeze = <T>(value: T, seen = new WeakSet<object>()): SoloDeepReadonly<T> => {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value as SoloDeepReadonly<T>
  seen.add(value)
  for (const entry of Object.values(value)) deepFreeze(entry, seen)
  return Object.freeze(value) as SoloDeepReadonly<T>
}

const frozenJson = <T extends SoloJsonValue>(value: T): SoloDeepReadonly<T> => deepFreeze(cloneStrictJson(value))

const cloneVector = (value: SoloVector): SoloVector => ({ x: value.x, y: value.y })

const cloneEntityState = (entity: SoloEntityState): SoloEntityState => ({
  id: entity.id,
  kind: entity.kind,
  mapId: entity.mapId,
  position: cloneVector(entity.position),
  velocity: cloneVector(entity.velocity),
  direction: entity.direction,
  moving: entity.moving,
  hitbox: cloneJson(entity.hitbox as SoloJsonValue) as SoloEntityState['hitbox'],
  speed: entity.speed,
  immovable: entity.immovable,
  stats: resolveStats(entity.stats),
  data: cloneJson(entity.data)
})

const cloneRuntimeView = (view: SoloRuntimeView): SoloRuntimeView => ({
  tick: view.tick,
  paused: view.paused,
  activeMapId: view.activeMapId,
  entities: view.entities.map(cloneEntityState)
})

const cloneRuntimeEvent = (event: SoloRuntimeEvent): SoloRuntimeEvent => {
  switch (event.type) {
    case 'command':
      return {
        type: 'command',
        record: cloneJson(event.record as unknown as Record<string, SoloJsonValue>) as unknown as SoloCommandRecord
      }
    case 'tick':
    case 'restored':
      return { type: event.type, view: cloneRuntimeView(event.view) }
    case 'pause':
      return { type: 'pause', paused: event.paused }
    case 'active-map':
      return { type: 'active-map', mapId: event.mapId }
    case 'entity-spawned':
      return { type: 'entity-spawned', entity: cloneEntityState(event.entity) }
    case 'entity-removed':
      return { type: 'entity-removed', entityId: event.entityId }
    case 'entity-transferred':
      return {
        type: 'entity-transferred',
        entity: cloneEntityState(event.entity),
        fromMapId: event.fromMapId
      }
  }
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value))

const hitboxExtents = (hitbox: SoloEntityState['hitbox']): SoloVector => {
  if (typeof hitbox === 'number') return { x: hitbox, y: hitbox }
  if ('type' in hitbox) {
    if (hitbox.type === 'circle') return { x: hitbox.radius, y: hitbox.radius }
    if (hitbox.type === 'capsule') return { x: hitbox.radius, y: hitbox.height / 2 }
    return { x: hitbox.width / 2, y: hitbox.height / 2 }
  }
  if ('radius' in hitbox) return { x: hitbox.radius, y: hitbox.radius }
  return { x: hitbox.width / 2, y: hitbox.height / 2 }
}

const boundedPosition = (
  map: SoloMapDefinition,
  hitbox: SoloEntityState['hitbox'],
  position: SoloVector
): SoloVector => {
  const extents = hitboxExtents(hitbox)
  const insetX = Math.min(extents.x, map.width / 2)
  const insetY = Math.min(extents.y, map.height / 2)
  return {
    x: clamp(position.x, insetX, map.width - insetX),
    y: clamp(position.y, insetY, map.height - insetY)
  }
}

const pointInsideObstacle = (
  point: SoloVector,
  obstacle: { minX: number; maxX: number; minY: number; maxY: number }
): boolean =>
  point.x > obstacle.minX &&
  point.x < obstacle.maxX &&
  point.y > obstacle.minY &&
  point.y < obstacle.maxY

const segmentObstacleEntry = (
  from: SoloVector,
  delta: SoloVector,
  obstacle: { minX: number; maxX: number; minY: number; maxY: number }
): number | null => {
  let entry = 0
  let exit = 1
  for (const [origin, change, minimum, maximum] of [
    [from.x, delta.x, obstacle.minX, obstacle.maxX],
    [from.y, delta.y, obstacle.minY, obstacle.maxY]
  ] as const) {
    if (Math.abs(change) < Number.EPSILON) {
      if (origin < minimum || origin > maximum) return null
      continue
    }
    const first = (minimum - origin) / change
    const second = (maximum - origin) / change
    entry = Math.max(entry, Math.min(first, second))
    exit = Math.min(exit, Math.max(first, second))
    if (entry > exit) return null
  }
  if (exit < 0 || entry > 1) return null
  if (entry <= Number.EPSILON && exit <= Number.EPSILON && !pointInsideObstacle(from, obstacle)) {
    return null
  }
  return Math.max(0, entry)
}

const collisionSafePosition = (
  map: SoloMapDefinition,
  hitbox: SoloEntityState['hitbox'],
  from: SoloVector,
  requested: SoloVector
): SoloVector => {
  const target = boundedPosition(map, hitbox, requested)
  const delta = { x: target.x - from.x, y: target.y - from.y }
  const distance = Math.hypot(delta.x, delta.y)
  if (distance <= Number.EPSILON) return target
  const extents = hitboxExtents(hitbox)
  let earliest = 1
  for (const obstacle of map.obstacles ?? []) {
    const entry = segmentObstacleEntry(from, delta, {
      minX: obstacle.x - obstacle.width / 2 - extents.x,
      maxX: obstacle.x + obstacle.width / 2 + extents.x,
      minY: obstacle.y - obstacle.height / 2 - extents.y,
      maxY: obstacle.y + obstacle.height / 2 + extents.y
    })
    if (entry !== null) earliest = Math.min(earliest, entry)
  }
  if (earliest >= 1) return target
  const clearance = Math.min(earliest, 0.25 / distance)
  const safeTime = Math.max(0, earliest - clearance)
  return {
    x: from.x + delta.x * safeTime,
    y: from.y + delta.y * safeTime
  }
}

const resolveStats = (stats: Partial<SoloStats> = {}): SoloStats => ({
  hp: stats.hp ?? stats.maxHp ?? 100,
  maxHp: stats.maxHp ?? 100,
  sp: stats.sp ?? stats.maxSp ?? 0,
  maxSp: stats.maxSp ?? 0,
  level: stats.level ?? 1,
  experience: stats.experience ?? 0,
  gold: stats.gold ?? 0,
  attributes: { ...(stats.attributes ?? {}) }
})

const assignStats = (target: SoloStats, source: Partial<SoloStats>): void => {
  const resolved = resolveStats(source)
  target.hp = resolved.hp
  target.maxHp = resolved.maxHp
  target.sp = resolved.sp
  target.maxSp = resolved.maxSp
  target.level = resolved.level
  target.experience = resolved.experience
  target.gold = resolved.gold
  for (const key of Object.keys(target.attributes)) delete target.attributes[key]
  Object.assign(target.attributes, resolved.attributes)
}

const assignData = (
  target: Record<string, SoloJsonValue>,
  source: Record<string, SoloJsonValue> = {}
): void => {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, cloneJson(source))
}

const directionFromVelocity = (velocity: SoloVector, fallback: SoloDirection): SoloDirection => {
  if (velocity.x === 0 && velocity.y === 0) return fallback
  if (Math.abs(velocity.x) >= Math.abs(velocity.y)) return velocity.x >= 0 ? 'right' : 'left'
  return velocity.y >= 0 ? 'down' : 'up'
}

/** Error raised when a command would violate the local runtime contract. */
export class SoloRuntimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SoloRuntimeError'
  }
}

/** Error raised when an isolated candidate can no longer publish safely. */
export class SoloCandidateTickError extends SoloRuntimeError {
  constructor(message: string) {
    super(message)
    this.name = 'SoloCandidateTickError'
  }
}

/** A candidate was based on a committed runtime that has since changed. */
export class SoloCandidateTickConflictError extends SoloCandidateTickError {
  constructor(message: string) {
    super(message)
    this.name = 'SoloCandidateTickConflictError'
  }
}

const validateObstacles = (
  mapId: string,
  obstacles: readonly SoloObstacleDefinition[] = []
): SoloObstacleDefinition[] => {
  const ids = new Set<string>()
  return obstacles.map((obstacle) => {
    if (!obstacle.id || ids.has(obstacle.id)) {
      throw new SoloRuntimeError(`Obstacle ids must be non-empty and unique on map ${mapId}`)
    }
    if (
      !Number.isFinite(obstacle.x)
      || !Number.isFinite(obstacle.y)
      || !Number.isFinite(obstacle.width)
      || !Number.isFinite(obstacle.height)
      || obstacle.width <= 0
      || obstacle.height <= 0
    ) {
      throw new SoloRuntimeError(`Obstacle geometry must be finite and positive: ${mapId}:${obstacle.id}`)
    }
    ids.add(obstacle.id)
    return { ...obstacle }
  })
}

/**
 * A deterministic, transport-free RPG runtime.
 *
 * Human controls, replays, and AI governors all call {@link dispatch}; no
 * socket, room, request, serialization, prediction, or reconciliation layer is
 * involved. Entity objects are mutated in place and are the sole gameplay
 * authority observed by renderers and UI.
 */
export class SoloRuntime {
  readonly fixedStepMs: number
  readonly maxFrameDeltaMs: number
  readonly maxStepsPerFrame: number

  private readonly maps = new Map<string, SoloMapRuntime>()
  private readonly entities = new Map<string, SoloEntityState>()
  private readonly physicalEntities = new Map<string, Entity>()
  private readonly listeners = new Set<SoloRuntimeListener>()
  private readonly candidateTickListeners = new Set<SoloCandidateTickListener>()
  private readonly candidateTickErrorListeners = new Set<SoloCandidateTickErrorListener>()
  private readonly actions = new Map<string, SoloActionHandler>()
  private readonly candidateSafeActions = new Set<string>()
  private readonly commandInterceptors = new Set<SoloCommandInterceptor>()
  private readonly candidateSafeCommandInterceptors = new Set<SoloCommandInterceptor>()
  private readonly commandLog: SoloCommandRecord[] = []
  private accumulatorMs = 0
  private currentTick = 0
  private isPaused = false
  private currentMapId: string | null = null

  constructor(options: SoloRuntimeOptions = {}) {
    this.fixedStepMs = options.fixedStepMs ?? DEFAULT_FIXED_STEP_MS
    this.maxFrameDeltaMs = options.maxFrameDeltaMs ?? DEFAULT_MAX_FRAME_DELTA_MS
    this.maxStepsPerFrame = options.maxStepsPerFrame ?? DEFAULT_MAX_STEPS_PER_FRAME

    if (!Number.isFinite(this.fixedStepMs) || this.fixedStepMs <= 0) {
      throw new SoloRuntimeError('fixedStepMs must be a positive finite number')
    }
    if (!Number.isFinite(this.maxFrameDeltaMs) || this.maxFrameDeltaMs < this.fixedStepMs) {
      throw new SoloRuntimeError('maxFrameDeltaMs must be finite and at least one fixed step')
    }
    if (!Number.isInteger(this.maxStepsPerFrame) || this.maxStepsPerFrame < 1) {
      throw new SoloRuntimeError('maxStepsPerFrame must be a positive integer')
    }
  }

  get tick(): number {
    return this.currentTick
  }

  get paused(): boolean {
    return this.isPaused
  }

  get activeMapId(): string | null {
    return this.currentMapId
  }

  registerMap(definition: SoloMapDefinition): void {
    if (this.maps.has(definition.id)) {
      throw new SoloRuntimeError(`Map already registered: ${definition.id}`)
    }
    if (definition.width <= 0 || definition.height <= 0) {
      throw new SoloRuntimeError(`Map dimensions must be positive: ${definition.id}`)
    }
    const pendingIds = new Set<string>()
    for (const entity of definition.entities ?? []) {
      if (this.entities.has(entity.id) || pendingIds.has(entity.id)) {
        throw new SoloRuntimeError(`Entity already exists: ${entity.id}`)
      }
      pendingIds.add(entity.id)
    }

    const obstacles = validateObstacles(definition.id, definition.obstacles)
    const physics = new PhysicsEngine({
      timeStep: this.fixedStepMs / 1000,
      enableSleep: false
    })
    const storedDefinition: SoloMapDefinition = {
      ...definition,
      obstacles,
      entities: definition.entities?.map((entity) => ({
        ...entity,
        stats: entity.stats ? resolveStats(entity.stats) : undefined,
        data: entity.data ? cloneJson(entity.data) : undefined
      })),
      data: definition.data ? cloneJson(definition.data) : undefined
    }
    const obstacleEntities = new Map<string, Entity>()
    this.maps.set(definition.id, { definition: storedDefinition, physics, obstacleEntities })

    for (const obstacle of obstacles) {
      obstacleEntities.set(
        obstacle.id,
        physics.createStaticObstacle(`map:${definition.id}:obstacle:${obstacle.id}`, {
          ...obstacle,
          collisionCategory: MAP_OBSTACLE_COLLISION_CATEGORY
        })
      )
    }
    for (const entity of definition.entities ?? []) {
      this.spawnEntity({ ...entity, mapId: definition.id })
    }
    if (this.currentMapId === null) this.currentMapId = definition.id
  }

  getMap(mapId: string): SoloMapDefinition | undefined {
    return this.maps.get(mapId)?.definition
  }

  /**
   * Atomically replaces a map's authored collision rectangles.
   *
   * Games use this when story state opens gates, repairs bridges, collapses
   * passages, or otherwise changes traversal without rebuilding the runtime.
   * Existing entity identity, position, and simulation state are preserved.
   */
  replaceMapObstacles(mapId: string, obstacles: readonly SoloObstacleDefinition[]): void {
    const map = this.requireMap(mapId)
    const next = validateObstacles(mapId, obstacles)

    for (const entity of map.obstacleEntities.values()) map.physics.removeEntity(entity)
    map.obstacleEntities.clear()
    for (const obstacle of next) {
      map.obstacleEntities.set(
        obstacle.id,
        map.physics.createStaticObstacle(`map:${mapId}:obstacle:${obstacle.id}`, {
          ...obstacle,
          collisionCategory: MAP_OBSTACLE_COLLISION_CATEGORY
        })
      )
    }
    map.definition = { ...map.definition, obstacles: next }
  }

  setActiveMap(mapId: string): void {
    this.requireMap(mapId)
    if (this.currentMapId === mapId) return
    this.currentMapId = mapId
    this.emit({ type: 'active-map', mapId })
  }

  spawnEntity(definition: SoloEntityDefinition): SoloEntityState {
    if (this.entities.has(definition.id)) {
      throw new SoloRuntimeError(`Entity already exists: ${definition.id}`)
    }
    const map = this.requireMap(definition.mapId)
    const state: SoloEntityState = {
      id: definition.id,
      kind: definition.kind,
      mapId: definition.mapId,
      position: boundedPosition(map.definition, definition.hitbox ?? DEFAULT_HITBOX, {
        x: definition.x,
        y: definition.y
      }),
      velocity: { x: 0, y: 0 },
      direction: definition.direction ?? 'down',
      moving: false,
      hitbox: definition.hitbox ?? DEFAULT_HITBOX,
      speed: definition.speed ?? DEFAULT_SPEED,
      immovable: definition.immovable ?? false,
      stats: resolveStats(definition.stats),
      data: definition.data ? cloneJson(definition.data) : {}
    }
    const physical = this.createPhysicalEntity(map, state)
    this.entities.set(state.id, state)
    this.physicalEntities.set(state.id, physical)
    this.emit({ type: 'entity-spawned', entity: state })
    return state
  }

  removeEntity(entityId: string): boolean {
    const state = this.entities.get(entityId)
    const physical = this.physicalEntities.get(entityId)
    if (!state || !physical) return false
    this.requireMap(state.mapId).physics.removeEntity(physical)
    this.entities.delete(entityId)
    this.physicalEntities.delete(entityId)
    this.emit({ type: 'entity-removed', entityId })
    return true
  }

  getEntity(entityId: string): SoloEntityState | undefined {
    return this.entities.get(entityId)
  }

  getEntities(mapId?: string): readonly SoloEntityState[] {
    const values = [...this.entities.values()]
    return mapId === undefined ? values : values.filter((entity) => entity.mapId === mapId)
  }

  registerAction(
    name: string,
    handler: SoloActionHandler,
    options: SoloCandidateSafeRegistration = {}
  ): () => void {
    if (this.actions.has(name)) throw new SoloRuntimeError(`Action already registered: ${name}`)
    this.actions.set(name, handler)
    if (options.candidateSafe === true) this.candidateSafeActions.add(name)
    return () => {
      if (this.actions.get(name) === handler) {
        this.actions.delete(name)
        this.candidateSafeActions.delete(name)
      }
    }
  }

  registerCommandInterceptor(
    interceptor: SoloCommandInterceptor,
    options: SoloCandidateSafeRegistration = {}
  ): () => void {
    this.commandInterceptors.add(interceptor)
    if (options.candidateSafe === true) this.candidateSafeCommandInterceptors.add(interceptor)
    return () => {
      this.candidateSafeCommandInterceptors.delete(interceptor)
      return this.commandInterceptors.delete(interceptor)
    }
  }

  dispatch(command: SoloCommand): SoloCommandResult {
    const source = command.source ?? 'human'
    const entity = this.entities.get(command.entityId)
    if (!entity) return { accepted: false, tick: this.currentTick, reason: `Unknown entity: ${command.entityId}` }

    for (const interceptor of this.commandInterceptors) {
      const rejection = interceptor(command, entity, source)
      if (rejection?.accepted === false) {
        return { accepted: false, tick: this.currentTick, reason: rejection.reason }
      }
    }

    switch (command.type) {
      case 'move': {
        if (entity.immovable) {
          return {
            accepted: false,
            tick: this.currentTick,
            reason: `Entity is immovable: ${entity.id}`
          }
        }
        const physical = this.requirePhysical(command.entityId)
        const accepted = this.requireMap(entity.mapId).physics.moveEntity(
          physical,
          command.vector,
          command.speed ?? entity.speed
        )
        if (!accepted) return { accepted: false, tick: this.currentTick, reason: 'Physics entity unavailable' }
        break
      }
      case 'stop':
        this.requireMap(entity.mapId).physics.moveEntity(this.requirePhysical(entity.id), 'idle')
        break
      case 'teleport': {
        const map = this.requireMap(entity.mapId)
        const physical = this.requirePhysical(entity.id)
        const destination =
          command.collision === 'ignore'
            ? boundedPosition(map.definition, entity.hitbox, command.position)
            : collisionSafePosition(map.definition, entity.hitbox, entity.position, command.position)
        map.physics.teleportEntity(physical, destination)
        if (destination.x !== command.position.x || destination.y !== command.position.y) {
          physical.setVelocity({ x: 0, y: 0 })
        }
        this.syncEntity(entity)
        break
      }
      case 'transfer-map':
        this.transferEntity(entity, command.mapId, command.position)
        break
      case 'action': {
        const handler = this.actions.get(command.action)
        if (!handler) {
          return { accepted: false, tick: this.currentTick, reason: `Unknown action: ${command.action}` }
        }
        const rejection = handler({ entity, payload: command.payload, source })
        if (rejection?.accepted === false) {
          return { accepted: false, tick: this.currentTick, reason: rejection.reason }
        }
        break
      }
    }

    const record: SoloCommandRecord = {
      tick: this.currentTick,
      source,
      command: cloneJson(command as SoloCommand & SoloJsonValue) as SoloCommand
    }
    this.commandLog.push(record)
    this.emit({ type: 'command', record })
    return { accepted: true, tick: this.currentTick }
  }

  dispatchMany(commands: readonly SoloCommand[]): SoloCommandResult[] {
    return commands.map((command) => this.dispatch(command))
  }

  step(frameDeltaMs: number): number {
    if (this.isPaused) return 0
    if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0) return 0
    this.accumulatorMs += Math.min(frameDeltaMs, this.maxFrameDeltaMs)
    let steps = 0
    while (this.accumulatorMs >= this.fixedStepMs && steps < this.maxStepsPerFrame) {
      this.runFixedTick()
      this.accumulatorMs -= this.fixedStepMs
      steps += 1
    }
    if (steps === this.maxStepsPerFrame && this.accumulatorMs >= this.fixedStepMs) {
      this.accumulatorMs %= this.fixedStepMs
    }
    return steps
  }

  stepTicks(count = 1): number {
    if (this.isPaused) return this.currentTick
    if (!Number.isInteger(count) || count < 0) throw new SoloRuntimeError('Tick count must be a non-negative integer')
    for (let index = 0; index < count; index += 1) this.runFixedTick()
    return this.currentTick
  }

  pause(): void {
    if (this.isPaused) return
    this.isPaused = true
    this.emit({ type: 'pause', paused: true })
  }

  resume(): void {
    if (!this.isPaused) return
    this.isPaused = false
    this.accumulatorMs = 0
    this.emit({ type: 'pause', paused: false })
  }

  subscribe(listener: SoloRuntimeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Subscribe to one immutable candidate-tick publication at a time.
   *
   * Unlike {@link subscribe}, this callback never observes candidate work that
   * later aborts. Its Rules view, game-owned reduced state, runtime events, and
   * domain events become visible together after the candidate commits.
   */
  subscribeCandidateTicks(listener: SoloCandidateTickListener): () => void {
    this.candidateTickListeners.add(listener)
    return () => this.candidateTickListeners.delete(listener)
  }

  /** Observe post-commit notification failures without changing commit status. */
  subscribeCandidateTickErrors(listener: SoloCandidateTickErrorListener): () => void {
    this.candidateTickErrorListeners.add(listener)
    return () => this.candidateTickErrorListeners.delete(listener)
  }

  /**
   * Fork the current committed runtime into one isolated next fixed tick.
   *
   * Commands and pure domain reducers execute against the candidate. No legacy
   * runtime listener or candidate-tick listener receives egress until commit.
   * Abort simply discards the candidate; it never restores over live state.
   */
  beginCandidateTick<TState extends SoloJsonValue>(
    options: SoloCandidateTickOptions<TState>
  ): SoloCandidateTick<TState> {
    if (!options || typeof options.id !== 'string' || options.id.length === 0) {
      throw new SoloCandidateTickError('Candidate tick id must be a non-empty string')
    }
    if (this.isPaused) throw new SoloCandidateTickError('A paused runtime cannot begin a candidate tick')
    if (options.expectedBaseTick !== undefined && options.expectedBaseTick !== this.currentTick) {
      throw new SoloCandidateTickConflictError(
        `Expected committed tick ${options.expectedBaseTick}, received ${this.currentTick}`
      )
    }

    const baseTick = this.currentTick
    const baseToken = this.candidateBaseToken()
    const candidate = this.forkCandidateRuntime()
    const runtimeEvents: SoloRuntimeEvent[] = []
    const unsubscribe = candidate.subscribe((event) => runtimeEvents.push(cloneRuntimeEvent(event)))
    candidate.stepTicks(1)
    if (candidate.tick !== baseTick + 1) {
      unsubscribe()
      throw new SoloCandidateTickError('Candidate fixed tick did not advance exactly once')
    }

    return new SoloCandidateTick({
      id: options.id,
      state: options.state,
      baseTick,
      candidate,
      runtimeEvents,
      dispose: unsubscribe,
      commit: (state, domainEvents) => this.commitCandidateTick(
        options.id,
        baseTick,
        baseToken,
        candidate,
        state,
        runtimeEvents,
        domainEvents
      )
    })
  }

  getView(mapId = this.currentMapId): SoloRuntimeView {
    return {
      tick: this.currentTick,
      paused: this.isPaused,
      activeMapId: this.currentMapId,
      entities: mapId === null ? [] : this.getEntities(mapId)
    }
  }

  getCommandLog(): readonly SoloCommandRecord[] {
    return this.commandLog
  }

  createSnapshot(): SoloRuntimeSnapshot {
    return {
      schema: 'rpgjs-solo-save',
      version: 1,
      tick: this.currentTick,
      paused: this.isPaused,
      activeMapId: this.currentMapId,
      entities: [...this.entities.values()].map((entity): SoloEntitySnapshot => ({
        id: entity.id,
        kind: entity.kind,
        mapId: entity.mapId,
        x: entity.position.x,
        y: entity.position.y,
        velocity: cloneVector(entity.velocity),
        hitbox: cloneJson(entity.hitbox as SoloJsonValue) as SoloEntitySnapshot['hitbox'],
        speed: entity.speed,
        immovable: entity.immovable,
        direction: entity.direction,
        stats: resolveStats(entity.stats),
        data: cloneJson(entity.data)
      }))
    }
  }

  restoreSnapshot(snapshot: SoloRuntimeSnapshot): void {
    if (snapshot.schema !== 'rpgjs-solo-save' || snapshot.version !== 1) {
      throw new SoloRuntimeError('Unsupported Solo save snapshot')
    }
    if (snapshot.activeMapId !== null) this.requireMap(snapshot.activeMapId)
    for (const saved of snapshot.entities) this.requireMap(saved.mapId)

    const savedIds = new Set(snapshot.entities.map((entity) => entity.id))
    for (const entityId of [...this.entities.keys()]) {
      if (!savedIds.has(entityId)) this.removeEntity(entityId)
    }

    for (const saved of snapshot.entities) {
      let state = this.entities.get(saved.id)
      if (!state) {
        state = this.spawnEntity(saved)
      } else {
        this.rebindPhysicalEntity(state, saved)
      }
      state.kind = saved.kind
      state.mapId = saved.mapId
      state.hitbox = cloneJson((saved.hitbox ?? DEFAULT_HITBOX) as SoloJsonValue) as SoloEntityState['hitbox']
      const bounded = boundedPosition(this.requireMap(saved.mapId).definition, state.hitbox, {
        x: saved.x,
        y: saved.y
      })
      const restoredVelocity = {
        x: bounded.x === saved.x ? saved.velocity.x : 0,
        y: bounded.y === saved.y ? saved.velocity.y : 0
      }
      state.position.x = bounded.x
      state.position.y = bounded.y
      state.velocity.x = restoredVelocity.x
      state.velocity.y = restoredVelocity.y
      state.direction = saved.direction ?? directionFromVelocity(restoredVelocity, 'down')
      state.moving = restoredVelocity.x !== 0 || restoredVelocity.y !== 0
      state.speed = saved.speed ?? DEFAULT_SPEED
      state.immovable = saved.immovable ?? false
      assignStats(state.stats, saved.stats ?? {})
      assignData(state.data, saved.data)

      const physical = this.requirePhysical(saved.id)
      physical.setVelocity(restoredVelocity)
      this.requireMap(saved.mapId).physics.updateEntity(physical)
    }

    this.currentTick = snapshot.tick
    this.isPaused = snapshot.paused
    this.currentMapId = snapshot.activeMapId
    this.accumulatorMs = 0
    this.commandLog.length = 0
    this.emit({ type: 'restored', view: this.getView() })
  }

  private runFixedTick(): void {
    for (const map of this.maps.values()) map.physics.stepFrame()
    this.currentTick += 1
    for (const entity of this.entities.values()) {
      this.enforceMapBounds(entity)
      this.syncEntity(entity)
    }
    this.emit({ type: 'tick', view: this.getView() })
  }

  private forkCandidateRuntime(): SoloRuntime {
    const candidate = new SoloRuntime({
      fixedStepMs: this.fixedStepMs,
      maxFrameDeltaMs: this.maxFrameDeltaMs,
      maxStepsPerFrame: this.maxStepsPerFrame
    })

    for (const map of this.maps.values()) {
      const definition = cloneJson(map.definition as unknown as Record<string, SoloJsonValue>) as unknown as SoloMapDefinition
      candidate.registerMap({ ...definition, entities: undefined })
      candidate.requireMap(definition.id).definition = definition
    }
    for (const entity of this.entities.values()) {
      const physical = this.requirePhysical(entity.id)
      const candidateEntity = candidate.spawnEntity({
        id: entity.id,
        kind: entity.kind,
        mapId: entity.mapId,
        x: physical.position.x,
        y: physical.position.y,
        hitbox: cloneJson(entity.hitbox as SoloJsonValue) as SoloEntityState['hitbox'],
        speed: entity.speed,
        immovable: entity.immovable,
        direction: entity.direction,
        stats: resolveStats(entity.stats),
        data: cloneJson(entity.data)
      })
      candidate.requirePhysical(entity.id).setVelocity(cloneVector(physical.velocity))
      candidate.syncEntity(candidateEntity)
    }
    candidate.currentTick = this.currentTick
    candidate.isPaused = this.isPaused
    candidate.currentMapId = this.currentMapId
    candidate.accumulatorMs = this.accumulatorMs
    candidate.commandLog.push(...this.commandLog.map((record) =>
      cloneJson(record as unknown as Record<string, SoloJsonValue>) as unknown as SoloCommandRecord
    ))
    for (const name of this.candidateSafeActions) {
      const handler = this.actions.get(name)
      if (handler) {
        candidate.actions.set(name, handler)
        candidate.candidateSafeActions.add(name)
      }
    }
    for (const interceptor of this.candidateSafeCommandInterceptors) {
      candidate.commandInterceptors.add(interceptor)
      candidate.candidateSafeCommandInterceptors.add(interceptor)
    }
    return candidate
  }

  private candidateBaseToken(): string {
    const maps = [...this.maps.values()]
      .map(({ definition }) => cloneJson(definition as unknown as Record<string, SoloJsonValue>))
      .sort((left, right) => String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0)
    const entities = [...this.entities.values()]
      .map((entity) => {
        const physical = this.requirePhysical(entity.id)
        return {
          ...cloneEntityState(entity),
          position: cloneVector(physical.position),
          velocity: cloneVector(physical.velocity)
        }
      })
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    return JSON.stringify({
      maps,
      entities,
      tick: this.currentTick,
      paused: this.isPaused,
      activeMapId: this.currentMapId,
      accumulatorMs: this.accumulatorMs,
      commandLog: this.commandLog,
      actionIds: [...this.actions.keys()].sort(),
      candidateSafeActionIds: [...this.candidateSafeActions].sort(),
      interceptorCount: this.commandInterceptors.size,
      candidateSafeInterceptorCount: this.candidateSafeCommandInterceptors.size
    })
  }

  private commitCandidateTick<TState extends SoloJsonValue>(
    id: string,
    baseTick: number,
    baseToken: string,
    candidate: SoloRuntime,
    state: SoloDeepReadonly<TState>,
    runtimeEvents: readonly SoloRuntimeEvent[],
    domainEvents: readonly SoloDeepReadonly<SoloDomainEvent>[]
  ): SoloCandidateTickPublication<TState> {
    if (this.currentTick !== baseTick || this.candidateBaseToken() !== baseToken) {
      throw new SoloCandidateTickConflictError(
        `Candidate ${id} was based on stale committed runtime state at tick ${baseTick}`
      )
    }
    if (candidate.currentTick !== baseTick + 1) {
      throw new SoloCandidateTickError(`Candidate ${id} must publish exactly tick ${baseTick + 1}`)
    }

    // Prepare a complete replacement physics world before touching live state.
    const preparedMaps = new Map<string, SoloMapRuntime>()
    for (const candidateMap of candidate.maps.values()) {
      const definition = cloneJson(
        candidateMap.definition as unknown as Record<string, SoloJsonValue>
      ) as unknown as SoloMapDefinition
      const obstacles = validateObstacles(definition.id, definition.obstacles)
      definition.obstacles = obstacles
      const physics = new PhysicsEngine({
        timeStep: this.fixedStepMs / 1000,
        enableSleep: false
      })
      const obstacleEntities = new Map<string, Entity>()
      for (const obstacle of obstacles) {
        obstacleEntities.set(
          obstacle.id,
          physics.createStaticObstacle(`map:${definition.id}:obstacle:${obstacle.id}`, {
            ...obstacle,
            collisionCategory: MAP_OBSTACLE_COLLISION_CATEGORY
          })
        )
      }
      preparedMaps.set(definition.id, { definition, physics, obstacleEntities })
    }

    const preparedStates = new Map<string, SoloEntityState>()
    const preparedSources = new Map<string, SoloEntityState>()
    const preparedPhysicalEntities = new Map<string, Entity>()
    for (const candidateEntity of candidate.entities.values()) {
      const candidatePhysical = candidate.requirePhysical(candidateEntity.id)
      const source = cloneEntityState(candidateEntity)
      source.position = cloneVector(candidatePhysical.position)
      source.velocity = cloneVector(candidatePhysical.velocity)
      source.moving = source.velocity.x !== 0 || source.velocity.y !== 0
      source.direction = directionFromVelocity(source.velocity, source.direction)

      const target = this.entities.get(source.id) ?? cloneEntityState(source)
      preparedStates.set(source.id, target)
      preparedSources.set(source.id, source)
      const map = preparedMaps.get(source.mapId)
      if (!map) throw new SoloCandidateTickError(`Candidate entity ${source.id} references unknown map ${source.mapId}`)
      const physical = this.createPhysicalEntity(map, source)
      physical.setVelocity(cloneVector(source.velocity))
      preparedPhysicalEntities.set(source.id, physical)
    }

    if (candidate.currentMapId !== null && !preparedMaps.has(candidate.currentMapId)) {
      throw new SoloCandidateTickError(`Candidate active map is unknown: ${candidate.currentMapId}`)
    }
    const preparedCommandLog = candidate.commandLog.map((record) =>
      cloneJson(record as unknown as Record<string, SoloJsonValue>) as unknown as SoloCommandRecord
    )
    const publishedRuntimeEvents = Object.freeze(runtimeEvents.map((event) => deepFreeze(cloneRuntimeEvent(event))))
    const publishedDomainEvents = Object.freeze(domainEvents.map((event) => deepFreeze(
      cloneStrictJson(event as unknown as SoloJsonValue) as unknown as SoloDomainEvent
    )))

    // The prepared structures above make this synchronous publication phase
    // non-throwing. Existing entity objects are updated in place for renderer,
    // combat, and UI identity compatibility.
    for (const source of preparedSources.values()) {
      const target = preparedStates.get(source.id)!
      target.kind = source.kind
      target.mapId = source.mapId
      target.position.x = source.position.x
      target.position.y = source.position.y
      target.velocity.x = source.velocity.x
      target.velocity.y = source.velocity.y
      target.direction = source.direction
      target.moving = target.velocity.x !== 0 || target.velocity.y !== 0
      target.hitbox = source.hitbox
      target.speed = source.speed
      target.immovable = source.immovable
      assignStats(target.stats, source.stats)
      for (const key of Object.keys(target.data)) delete target.data[key]
      Object.assign(target.data, source.data)
    }

    this.maps.clear()
    for (const [mapId, map] of preparedMaps) this.maps.set(mapId, map)
    this.entities.clear()
    for (const [entityId, entity] of preparedStates) this.entities.set(entityId, entity)
    this.physicalEntities.clear()
    for (const [entityId, physical] of preparedPhysicalEntities) this.physicalEntities.set(entityId, physical)
    this.currentTick = candidate.currentTick
    this.isPaused = candidate.isPaused
    this.currentMapId = candidate.currentMapId
    this.accumulatorMs = candidate.accumulatorMs
    this.commandLog.length = 0
    this.commandLog.push(...preparedCommandLog)
    const publication = Object.freeze({
      id,
      baseTick,
      tick: this.currentTick,
      state,
      view: deepFreeze(cloneRuntimeView(this.getView())),
      runtimeEvents: publishedRuntimeEvents,
      domainEvents: publishedDomainEvents
    }) as SoloCandidateTickPublication<TState>

    const notificationErrors: SoloCandidateTickNotificationError[] = []
    for (const listener of this.candidateTickListeners) {
      try {
        listener(publication as unknown as SoloCandidateTickPublication)
      } catch (error) {
        notificationErrors.push({
          candidateId: id,
          tick: this.currentTick,
          phase: 'candidate-publication',
          error
        })
      }
    }
    for (const event of runtimeEvents) {
      const committedEvent = this.materializeCommittedEvent(event)
      for (const listener of this.listeners) {
        try {
          listener(committedEvent)
        } catch (error) {
          notificationErrors.push({
            candidateId: id,
            tick: this.currentTick,
            phase: 'legacy-runtime-event',
            runtimeEventType: committedEvent.type,
            error
          })
        }
      }
    }
    for (const failure of notificationErrors) {
      for (const listener of this.candidateTickErrorListeners) {
        try {
          listener(failure)
        } catch {
          // Post-commit diagnostics cannot change commit status or block peers.
        }
      }
    }
    return publication
  }

  private materializeCommittedEvent(event: SoloRuntimeEvent): SoloRuntimeEvent {
    switch (event.type) {
      case 'tick':
      case 'restored':
        return { type: event.type, view: this.getView() }
      case 'entity-spawned':
        return { type: 'entity-spawned', entity: this.entities.get(event.entity.id) ?? event.entity }
      case 'entity-transferred':
        return {
          type: 'entity-transferred',
          entity: this.entities.get(event.entity.id) ?? event.entity,
          fromMapId: event.fromMapId
        }
      default:
        return cloneRuntimeEvent(event)
    }
  }

  private syncEntity(state: SoloEntityState): void {
    const physical = this.requirePhysical(state.id)
    state.position.x = physical.position.x
    state.position.y = physical.position.y
    state.velocity.x = physical.velocity.x
    state.velocity.y = physical.velocity.y
    state.moving = physical.velocity.x !== 0 || physical.velocity.y !== 0
    state.direction = directionFromVelocity(state.velocity, state.direction)
  }

  private transferEntity(state: SoloEntityState, mapId: string, position: SoloVector): void {
    const destination = this.requireMap(mapId)
    const fromMapId = state.mapId
    const oldPhysical = this.requirePhysical(state.id)
    this.requireMap(fromMapId).physics.removeEntity(oldPhysical)
    state.mapId = mapId
    const bounded = boundedPosition(destination.definition, state.hitbox, position)
    state.position.x = bounded.x
    state.position.y = bounded.y
    state.velocity.x = 0
    state.velocity.y = 0
    state.moving = false
    const physical = this.createPhysicalEntity(destination, state)
    this.physicalEntities.set(state.id, physical)
    if (state.kind === 'player' && this.currentMapId === fromMapId) this.setActiveMap(mapId)
    this.emit({ type: 'entity-transferred', entity: state, fromMapId })
  }

  private rebindPhysicalEntity(state: SoloEntityState, saved: SoloEntitySnapshot): void {
    const currentPhysical = this.requirePhysical(state.id)
    this.requireMap(state.mapId).physics.removeEntity(currentPhysical)
    state.mapId = saved.mapId
    const bounded = boundedPosition(this.requireMap(saved.mapId).definition, saved.hitbox ?? DEFAULT_HITBOX, {
      x: saved.x,
      y: saved.y
    })
    state.position.x = bounded.x
    state.position.y = bounded.y
    state.hitbox = saved.hitbox ?? DEFAULT_HITBOX
    state.speed = saved.speed ?? DEFAULT_SPEED
    state.immovable = saved.immovable ?? false
    const replacement = this.createPhysicalEntity(this.requireMap(saved.mapId), state)
    this.physicalEntities.set(state.id, replacement)
  }

  private createPhysicalEntity(map: SoloMapRuntime, state: SoloEntityState): Entity {
    const projectile = state.kind === 'projectile'
    return map.physics.createCharacter(state.id, {
      x: state.position.x,
      y: state.position.y,
      hitbox: state.hitbox as RPGHitbox,
      speed: state.speed,
      mass: state.immovable ? 0 : 1,
      collisionCategory: projectile ? PROJECTILE_COLLISION_CATEGORY : ACTOR_COLLISION_CATEGORY,
      collisionMask: projectile ? MAP_OBSTACLE_COLLISION_CATEGORY : 0xffffffff,
      linearDamping: 0,
      restitution: 0
    })
  }

  private enforceMapBounds(state: SoloEntityState): void {
    const map = this.requireMap(state.mapId)
    const physical = this.requirePhysical(state.id)
    const bounded = boundedPosition(map.definition, state.hitbox, physical.position)
    const clampedX = bounded.x !== physical.position.x
    const clampedY = bounded.y !== physical.position.y
    if (!clampedX && !clampedY) return
    map.physics.teleportEntity(physical, bounded)
    physical.setVelocity({
      x: clampedX ? 0 : physical.velocity.x,
      y: clampedY ? 0 : physical.velocity.y
    })
  }

  private requireMap(mapId: string): SoloMapRuntime {
    const map = this.maps.get(mapId)
    if (!map) throw new SoloRuntimeError(`Unknown map: ${mapId}`)
    return map
  }

  private requirePhysical(entityId: string): Entity {
    const entity = this.physicalEntities.get(entityId)
    if (!entity) throw new SoloRuntimeError(`Missing physical entity: ${entityId}`)
    return entity
  }

  private emit(event: SoloRuntimeEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

interface SoloCandidateTickConstruction<TState extends SoloJsonValue> {
  id: string
  state: TState
  baseTick: number
  candidate: SoloRuntime
  runtimeEvents: SoloRuntimeEvent[]
  dispose: () => void
  commit: (
    state: SoloDeepReadonly<TState>,
    domainEvents: readonly SoloDeepReadonly<SoloDomainEvent>[]
  ) => SoloCandidateTickPublication<TState>
}

/**
 * One isolated, exactly-next fixed tick of Solo Rules plus game-owned JSON state.
 *
 * Use {@link SoloRuntime.beginCandidateTick}; constructing this class directly
 * is intentionally unsupported.
 */
export class SoloCandidateTick<TState extends SoloJsonValue> {
  readonly id: string
  readonly baseTick: number
  readonly tick: number
  private readonly candidate: SoloRuntime
  private readonly runtimeEvents: SoloRuntimeEvent[]
  private readonly disposeCandidateListener: () => void
  private readonly commitCandidate: SoloCandidateTickConstruction<TState>['commit']
  private readonly domainEvents: SoloDeepReadonly<SoloDomainEvent>[] = []
  private readonly domainEventIds = new Set<string>()
  private candidateState: SoloDeepReadonly<TState>
  private currentStatus: SoloCandidateTickStatus = 'active'

  constructor(construction: SoloCandidateTickConstruction<TState>) {
    this.id = construction.id
    this.baseTick = construction.baseTick
    this.tick = construction.candidate.tick
    this.candidate = construction.candidate
    this.runtimeEvents = construction.runtimeEvents
    this.disposeCandidateListener = construction.dispose
    this.commitCandidate = construction.commit
    this.candidateState = frozenJson(construction.state)
  }

  get status(): SoloCandidateTickStatus {
    return this.currentStatus
  }

  get state(): SoloDeepReadonly<TState> {
    return this.candidateState
  }

  getView(mapId?: string | null): SoloRuntimeView {
    this.requireActive()
    return deepFreeze(cloneRuntimeView(this.candidate.getView(mapId))) as SoloRuntimeView
  }

  getEntity(entityId: string): SoloDeepReadonly<SoloEntityState> | undefined {
    this.requireActive()
    const entity = this.candidate.getEntity(entityId)
    return entity ? deepFreeze(cloneEntityState(entity)) : undefined
  }

  getMap(mapId: string): SoloDeepReadonly<SoloMapDefinition> | undefined {
    this.requireActive()
    const map = this.candidate.getMap(mapId)
    if (!map) return undefined
    return deepFreeze(
      cloneJson(map as unknown as Record<string, SoloJsonValue>) as unknown as SoloMapDefinition
    )
  }

  getCommandLog(): readonly SoloCommandRecord[] {
    this.requireActive()
    return Object.freeze(this.candidate.getCommandLog().map((record) => deepFreeze(
      cloneJson(record as unknown as Record<string, SoloJsonValue>) as unknown as SoloCommandRecord
    ))) as unknown as readonly SoloCommandRecord[]
  }

  dispatch(command: SoloCommand): SoloCommandResult {
    this.requireActive()
    return this.candidate.dispatch(command)
  }

  dispatchMany(commands: readonly SoloCommand[]): SoloCommandResult[] {
    this.requireActive()
    return this.candidate.dispatchMany(commands)
  }

  spawnEntity(definition: SoloEntityDefinition): SoloDeepReadonly<SoloEntityState> {
    this.requireActive()
    return deepFreeze(cloneEntityState(this.candidate.spawnEntity(definition)))
  }

  removeEntity(entityId: string): boolean {
    this.requireActive()
    return this.candidate.removeEntity(entityId)
  }

  replaceMapObstacles(mapId: string, obstacles: readonly SoloObstacleDefinition[]): void {
    this.requireActive()
    this.candidate.replaceMapObstacles(mapId, obstacles)
  }

  /** Stage a typed event and replace game-owned candidate state through a pure reducer. */
  reduce<TEvent extends SoloDomainEvent>(
    event: TEvent,
    reducer: SoloDomainReducer<TState, TEvent>
  ): SoloDeepReadonly<TState> {
    this.requireActive()
    try {
      const stagedEvent = this.validateDomainEvent(event) as SoloDeepReadonly<TEvent>
      const next = reducer(this.candidateState, stagedEvent)
      this.candidateState = frozenJson(next)
      this.domainEventIds.add(stagedEvent.id)
      this.domainEvents.push(stagedEvent as SoloDeepReadonly<SoloDomainEvent>)
      return this.candidateState
    } catch (error) {
      this.currentStatus = 'failed'
      throw error
    }
  }

  /** Dispatch, then reduce only when the authoritative candidate accepts. */
  dispatchAndReduce<TEvent extends SoloDomainEvent>(
    command: SoloCommand,
    event: TEvent,
    reducer: SoloDomainReducer<TState, TEvent>
  ): SoloCommandResult {
    const result = this.dispatch(command)
    if (result.accepted) this.reduce(event, reducer)
    return result
  }

  commit(): SoloCandidateTickPublication<TState> {
    this.requireActive()
    this.disposeCandidateListener()
    // No observer is invoked until the live runtime has committed, but those
    // observers run inside the commit callback. Close this candidate first so
    // a publication listener cannot re-enter, abort, or mutate it.
    this.currentStatus = 'committed'
    try {
      return this.commitCandidate(this.candidateState, this.domainEvents)
    } catch (error) {
      this.currentStatus = 'aborted'
      throw error
    }
  }

  abort(): void {
    if (this.currentStatus === 'committed') {
      throw new SoloCandidateTickError(`Candidate ${this.id} has already committed`)
    }
    if (this.currentStatus === 'aborted') return
    this.disposeCandidateListener()
    this.runtimeEvents.length = 0
    this.domainEvents.length = 0
    this.currentStatus = 'aborted'
  }

  private validateDomainEvent<TEvent extends SoloDomainEvent>(event: TEvent): SoloDeepReadonly<TEvent> {
    if (!event || typeof event.id !== 'string' || event.id.length === 0) {
      throw new SoloCandidateTickError('Domain event id must be a non-empty string')
    }
    if (typeof event.type !== 'string' || event.type.length === 0) {
      throw new SoloCandidateTickError('Domain event type must be a non-empty string')
    }
    if (event.tick !== this.tick) {
      throw new SoloCandidateTickError(`Domain event ${event.id} must target candidate tick ${this.tick}`)
    }
    if (this.domainEventIds.has(event.id)) {
      throw new SoloCandidateTickError(`Duplicate domain event id: ${event.id}`)
    }
    return deepFreeze(cloneStrictJson(event as unknown as SoloJsonValue) as unknown as TEvent)
  }

  private requireActive(): void {
    if (this.currentStatus !== 'active') {
      throw new SoloCandidateTickError(`Candidate ${this.id} is ${this.currentStatus}`)
    }
  }
}
