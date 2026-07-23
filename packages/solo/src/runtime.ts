import { PhysicsEngine, type Entity, type RPGHitbox } from '@rpgjs/physic'
import type {
  SoloActionHandler,
  SoloCommand,
  SoloCommandRecord,
  SoloCommandResult,
  SoloCommandInterceptor,
  SoloCommandSource,
  SoloDirection,
  SoloEntityDefinition,
  SoloEntitySnapshot,
  SoloEntityState,
  SoloJsonValue,
  SoloMapDefinition,
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

interface SoloMapRuntime {
  definition: SoloMapDefinition
  physics: PhysicsEngine
}

const cloneJson = <T extends SoloJsonValue | Record<string, SoloJsonValue>>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T

const cloneVector = (value: SoloVector): SoloVector => ({ x: value.x, y: value.y })

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
  private readonly actions = new Map<string, SoloActionHandler>()
  private readonly commandInterceptors = new Set<SoloCommandInterceptor>()
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

    const physics = new PhysicsEngine({
      timeStep: this.fixedStepMs / 1000,
      enableSleep: false
    })
    const storedDefinition: SoloMapDefinition = {
      ...definition,
      obstacles: definition.obstacles?.map((obstacle) => ({ ...obstacle })),
      entities: definition.entities?.map((entity) => ({
        ...entity,
        stats: entity.stats ? resolveStats(entity.stats) : undefined,
        data: entity.data ? cloneJson(entity.data) : undefined
      })),
      data: definition.data ? cloneJson(definition.data) : undefined
    }
    this.maps.set(definition.id, { definition: storedDefinition, physics })

    for (const obstacle of definition.obstacles ?? []) {
      physics.createStaticObstacle(`map:${definition.id}:obstacle:${obstacle.id}`, obstacle)
    }
    for (const entity of definition.entities ?? []) {
      this.spawnEntity({ ...entity, mapId: definition.id })
    }
    if (this.currentMapId === null) this.currentMapId = definition.id
  }

  getMap(mapId: string): SoloMapDefinition | undefined {
    return this.maps.get(mapId)?.definition
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

  registerAction(name: string, handler: SoloActionHandler): () => void {
    if (this.actions.has(name)) throw new SoloRuntimeError(`Action already registered: ${name}`)
    this.actions.set(name, handler)
    return () => {
      if (this.actions.get(name) === handler) this.actions.delete(name)
    }
  }

  registerCommandInterceptor(interceptor: SoloCommandInterceptor): () => void {
    this.commandInterceptors.add(interceptor)
    return () => this.commandInterceptors.delete(interceptor)
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
        const bounded = boundedPosition(map.definition, entity.hitbox, command.position)
        map.physics.teleportEntity(physical, bounded)
        if (bounded.x !== command.position.x || bounded.y !== command.position.y) {
          physical.setVelocity({
            x: bounded.x !== command.position.x ? 0 : physical.velocity.x,
            y: bounded.y !== command.position.y ? 0 : physical.velocity.y
          })
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
    return map.physics.createCharacter(state.id, {
      x: state.position.x,
      y: state.position.y,
      hitbox: state.hitbox as RPGHitbox,
      speed: state.speed,
      mass: state.immovable ? 0 : 1,
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
