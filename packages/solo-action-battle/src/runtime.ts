import type {
  SoloActionContext,
  SoloCommand,
  SoloCommandRejection,
  SoloEntityState,
  SoloJsonValue,
  SoloRuntime,
  SoloRuntimeEvent,
  SoloVector
} from '@jbcom/rpgjs-solo'
import { normalizeSoloAttackProfile } from './profiles'
import type {
  NormalizedSoloAttackProfile,
  SoloActiveCombatAction,
  SoloCombatActionDefinition,
  SoloCombatEvent,
  SoloCombatGuardPayload,
  SoloCombatHitContext,
  SoloCombatListener,
  SoloCombatStatusDefinition,
  SoloCombatStatusState,
  SoloCombatUseContext,
  SoloCombatUsePayload,
  SoloCombatantDefinition,
  SoloCombatantState
} from './types'

const COMBAT_KEY = 'soloActionBattle'
const PROJECTILE_KEY = 'soloActionBattleProjectile'
const EPSILON = 0.0001

interface SoloCombatProjectileState {
  schema: 'rpgjs-solo-action-battle-projectile'
  version: 1
  attackerId: string
  actionId: string
  source: 'human' | 'ai' | 'replay' | 'system'
  direction: SoloVector
  remainingRange: number
  radius: number
  maxHits: number
  hitIds: string[]
  lastPosition: SoloVector
  spawnTick: number
  appearance?: string
}

const reject = (reason: string): SoloCommandRejection => ({ accepted: false, reason })

const isRecord = (value: SoloJsonValue | undefined): value is Record<string, SoloJsonValue> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const isVector = (value: SoloJsonValue | undefined): value is { x: number; y: number } =>
  isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number'

const normalize = (vector: SoloVector): SoloVector => {
  const length = Math.hypot(vector.x, vector.y)
  return length <= EPSILON ? { x: 0, y: 1 } : { x: vector.x / length, y: vector.y / length }
}

const facingVector = (entity: SoloEntityState): SoloVector => {
  switch (entity.direction) {
    case 'up': return { x: 0, y: -1 }
    case 'left': return { x: -1, y: 0 }
    case 'right': return { x: 1, y: 0 }
    default: return { x: 0, y: 1 }
  }
}

const distanceBetween = (left: SoloEntityState, right: SoloEntityState): number =>
  Math.hypot(right.position.x - left.position.x, right.position.y - left.position.y)

const collisionRadius = (entity: SoloEntityState): number => {
  if (typeof entity.hitbox === 'number') return entity.hitbox
  if ('radius' in entity.hitbox) return entity.hitbox.radius
  return Math.max(entity.hitbox.width, entity.hitbox.height) / 2
}

const withinArc = (
  origin: SoloEntityState,
  target: SoloEntityState,
  direction: SoloVector,
  arcDegrees: number
): boolean => {
  if (arcDegrees >= 360) return true
  const offset = normalize({
    x: target.position.x - origin.position.x,
    y: target.position.y - origin.position.y
  })
  const threshold = Math.cos((Math.max(0, arcDegrees) * Math.PI) / 360)
  return offset.x * direction.x + offset.y * direction.y >= threshold
}

const readUsePayload = (payload: SoloJsonValue | undefined): SoloCombatUsePayload | undefined => {
  if (!isRecord(payload) || typeof payload.actionId !== 'string') return undefined
  return {
    actionId: payload.actionId,
    targetId: typeof payload.targetId === 'string' ? payload.targetId : undefined,
    direction: isVector(payload.direction) ? normalize(payload.direction) : undefined
  }
}

const readGuardPayload = (payload: SoloJsonValue | undefined): SoloCombatGuardPayload | undefined =>
  isRecord(payload) && typeof payload.active === 'boolean' ? { active: payload.active } : undefined

const combatState = (entity: SoloEntityState): SoloCombatantState | undefined => {
  const value = entity.data[COMBAT_KEY]
  if (!isRecord(value) || value.schema !== 'rpgjs-solo-action-battle' || value.version !== 1) return undefined
  return value as unknown as SoloCombatantState
}

const projectileState = (entity: SoloEntityState): SoloCombatProjectileState | undefined => {
  const value = entity.data[PROJECTILE_KEY]
  if (!isRecord(value) || value.schema !== 'rpgjs-solo-action-battle-projectile' || value.version !== 1) {
    return undefined
  }
  return value as unknown as SoloCombatProjectileState
}

const writeJson = (entity: SoloEntityState, key: string, value: object): void => {
  entity.data[key] = value as unknown as SoloJsonValue
}

export class SoloActionBattle {
  private readonly actions = new Map<string, SoloCombatActionDefinition>()
  private readonly listeners = new Set<SoloCombatListener>()
  private readonly disposeRuntime: Array<() => void> = []
  private projectileCounter = 0

  constructor(readonly runtime: SoloRuntime) {
    this.disposeRuntime.push(
      runtime.registerAction('combat:use', (context) => this.useAction(context)),
      runtime.registerAction('combat:guard', (context) => this.changeGuard(context)),
      runtime.registerCommandInterceptor((command, entity, source) =>
        this.interceptCommand(command, entity, source)
      ),
      runtime.subscribe((event) => this.onRuntimeEvent(event))
    )
  }

  registerAction(definition: SoloCombatActionDefinition): () => void {
    if (this.actions.has(definition.id)) throw new Error(`Combat action already registered: ${definition.id}`)
    if (!definition.name.trim()) throw new Error(`Combat action name is required: ${definition.id}`)
    if (definition.mode === 'projectile' && !definition.projectile) {
      throw new Error(`Projectile action requires projectile settings: ${definition.id}`)
    }
    this.actions.set(definition.id, definition)
    return () => {
      if (this.actions.get(definition.id) === definition) this.actions.delete(definition.id)
    }
  }

  registerCombatant(entityId: string, definition: SoloCombatantDefinition): SoloCombatantState {
    const entity = this.runtime.getEntity(entityId)
    if (!entity) throw new Error(`Unknown combatant entity: ${entityId}`)
    const unknownActions = definition.actions.filter((actionId) => !this.actions.has(actionId))
    if (unknownActions.length > 0) {
      throw new Error(`Unknown combat actions for ${entityId}: ${unknownActions.join(', ')}`)
    }
    const state: SoloCombatantState = {
      schema: 'rpgjs-solo-action-battle',
      version: 1,
      faction: definition.faction,
      actions: [...definition.actions],
      power: definition.power ?? entity.stats.attributes.power ?? 10,
      armor: definition.armor ?? entity.stats.attributes.armor ?? 0,
      guard: {
        arcDegrees: definition.guard?.arcDegrees ?? 120,
        damageReduction: definition.guard?.damageReduction ?? 0.6,
        spCostPerHit: definition.guard?.spCostPerHit ?? 0
      },
      guarding: false,
      cooldownUntil: {},
      statuses: {},
      active: null,
      defeated: entity.stats.hp <= 0
    }
    writeJson(entity, COMBAT_KEY, state)
    return state
  }

  getCombatant(entityId: string): SoloCombatantState | undefined {
    const entity = this.runtime.getEntity(entityId)
    return entity ? combatState(entity) : undefined
  }

  subscribe(listener: SoloCombatListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  applyStatus(targetId: string, definition: SoloCombatStatusDefinition, sourceId?: string): boolean {
    const target = this.runtime.getEntity(targetId)
    const state = target ? combatState(target) : undefined
    if (!target || !state || state.defeated || definition.durationTicks <= 0) return false
    const current = state.statuses[definition.id]
    const stacks = Math.min(
      definition.maxStacks ?? 1,
      (current?.stacks ?? 0) + (definition.stacks ?? 1)
    )
    const status: SoloCombatStatusState = {
      id: definition.id,
      stacks,
      expiresTick: Math.max(current?.expiresTick ?? 0, this.runtime.tick + definition.durationTicks),
      sourceId,
      data: definition.data ? { ...definition.data } : undefined
    }
    state.statuses[definition.id] = status
    this.emit({
      type: 'status-applied',
      targetId,
      statusId: definition.id,
      stacks,
      expiresTick: status.expiresTick,
      tick: this.runtime.tick
    })
    return true
  }

  removeStatus(targetId: string, statusId: string): boolean {
    const state = this.getCombatant(targetId)
    if (!state?.statuses[statusId]) return false
    delete state.statuses[statusId]
    return true
  }

  dispose(): void {
    for (const dispose of this.disposeRuntime.splice(0)) dispose()
    this.listeners.clear()
    this.actions.clear()
  }

  private useAction(context: SoloActionContext): void | SoloCommandRejection {
    if (this.runtime.paused) return reject('Combat is paused')
    const payload = readUsePayload(context.payload)
    if (!payload) return reject('combat:use requires an actionId payload')
    const state = combatState(context.entity)
    if (!state) return reject(`Entity is not a combatant: ${context.entity.id}`)
    if (state.defeated || context.entity.stats.hp <= 0) return reject('Combatant is defeated')
    if (this.hasStatus(state, 'stun')) return reject('Combatant is stunned')
    if (state.active) return reject(`Combatant is already using ${state.active.id}`)
    if (!state.actions.includes(payload.actionId)) return reject(`Combatant has not learned ${payload.actionId}`)
    const action = this.actions.get(payload.actionId)
    if (!action) return reject(`Unknown combat action: ${payload.actionId}`)
    const cooldownUntil = state.cooldownUntil[action.id] ?? 0
    if (cooldownUntil > this.runtime.tick) return reject(`${action.id} is on cooldown until tick ${cooldownUntil}`)
    const missingStatus = action.requiresStatuses?.find((statusId) => !this.hasStatus(state, statusId))
    if (missingStatus) return reject(`${action.id} requires status ${missingStatus}`)
    const spCost = Math.max(0, action.spCost ?? 0)
    if (context.entity.stats.sp < spCost) return reject(`Not enough SP for ${action.id}`)

    const direction = payload.direction ?? facingVector(context.entity)
    const target = this.resolveRequestedTarget(context.entity, state, action, payload.targetId, direction)
    if (typeof target === 'string') return reject(target)
    const useContext: SoloCombatUseContext = {
      runtime: this.runtime,
      attacker: context.entity,
      action,
      target,
      direction,
      source: context.source
    }
    const custom = action.canUse?.(useContext)
    if (custom === false) return reject(`${action.id} cannot be used now`)
    if (typeof custom === 'string') return reject(custom)

    context.entity.stats.sp -= spCost
    for (const statusId of action.consumesStatuses ?? []) delete state.statuses[statusId]
    const profile = normalizeSoloAttackProfile(action.profile)
    const activeTick = this.runtime.tick + Math.max(1, profile.startupTicks)
    const active: SoloActiveCombatAction = {
      id: action.id,
      source: context.source,
      targetId: target?.id,
      direction,
      phase: profile.startupTicks > 0 ? 'startup' : 'active',
      startedTick: this.runtime.tick,
      activeTick,
      recoveryTick: activeTick + profile.activeTicks,
      endsTick: activeTick + profile.activeTicks + profile.recoveryTicks,
      resolved: false
    }
    state.active = active
    state.guarding = false
    state.cooldownUntil[action.id] = this.runtime.tick + profile.cooldownTicks
    if (profile.movementLock) {
      this.runtime.dispatch({ type: 'stop', entityId: context.entity.id, source: 'system' })
    }
    this.emit({
      type: 'action-started',
      entityId: context.entity.id,
      actionId: action.id,
      targetId: target?.id,
      tick: this.runtime.tick
    })
  }

  private changeGuard(context: SoloActionContext): void | SoloCommandRejection {
    const payload = readGuardPayload(context.payload)
    if (!payload) return reject('combat:guard requires an active boolean payload')
    const state = combatState(context.entity)
    if (!state) return reject(`Entity is not a combatant: ${context.entity.id}`)
    if (payload.active && (state.defeated || state.active || this.hasStatus(state, 'stun'))) {
      return reject('Combatant cannot guard now')
    }
    state.guarding = payload.active
    if (payload.active) this.runtime.dispatch({ type: 'stop', entityId: context.entity.id, source: 'system' })
    this.emit({ type: 'guard-changed', entityId: context.entity.id, guarding: payload.active, tick: this.runtime.tick })
  }

  private interceptCommand(
    command: SoloCommand,
    entity: SoloEntityState,
    source: 'human' | 'ai' | 'replay' | 'system'
  ): void | SoloCommandRejection {
    if (source === 'system') return
    const state = combatState(entity)
    if (!state) return
    if (command.type === 'move') {
      if (state.defeated) return reject('Defeated combatants cannot move')
      if (state.guarding) return reject('Guarding locks movement')
      if (this.hasStatus(state, 'root')) return reject('Combatant is rooted')
      if (this.hasStatus(state, 'stun')) return reject('Combatant is stunned')
      const action = state.active ? this.actions.get(state.active.id) : undefined
      if (action && normalizeSoloAttackProfile(action.profile).movementLock) {
        return reject(`Movement is locked during ${action.id}`)
      }
    }
    if (command.type === 'action' && this.hasStatus(state, 'stun') && command.action !== 'combat:guard') {
      return reject('Combatant is stunned')
    }
  }

  private onRuntimeEvent(event: SoloRuntimeEvent): void {
    if (event.type !== 'tick') return
    for (const entity of this.runtime.getEntities()) {
      const state = combatState(entity)
      if (state) this.processCombatant(entity, state)
    }
    for (const entity of [...this.runtime.getEntities()]) {
      const state = projectileState(entity)
      if (state) this.processProjectile(entity, state)
    }
  }

  private processCombatant(entity: SoloEntityState, state: SoloCombatantState): void {
    for (const [statusId, status] of Object.entries(state.statuses)) {
      if (status.expiresTick > this.runtime.tick) continue
      delete state.statuses[statusId]
      this.emit({ type: 'status-expired', targetId: entity.id, statusId, tick: this.runtime.tick })
    }
    if (entity.stats.hp <= 0) state.defeated = true
    const active = state.active
    if (!active) return
    const action = this.actions.get(active.id)
    if (!action) {
      state.active = null
      return
    }
    const profile = normalizeSoloAttackProfile(action.profile)
    if (!profile.directionLock) active.direction = facingVector(entity)
    const activeNow = this.runtime.tick >= active.activeTick && this.runtime.tick < active.recoveryTick
    if (activeNow) {
      if (active.phase !== 'active') {
        active.phase = 'active'
        this.emit({ type: 'action-phase', entityId: entity.id, actionId: action.id, phase: 'active', tick: this.runtime.tick })
      }
      const repeat = profile.hitPolicy === 'allowRepeatHits' && action.mode !== 'projectile'
      if (!active.resolved || repeat) this.resolveAction(entity, state, action, active)
      active.resolved = true
    }
    if (active.phase !== 'recovery' && this.runtime.tick >= active.recoveryTick) {
      active.phase = 'recovery'
      this.emit({ type: 'action-phase', entityId: entity.id, actionId: action.id, phase: 'recovery', tick: this.runtime.tick })
    }
    if (this.runtime.tick >= active.endsTick) {
      state.active = null
      this.emit({ type: 'action-finished', entityId: entity.id, actionId: action.id, tick: this.runtime.tick })
    }
  }

  private resolveAction(
    attacker: SoloEntityState,
    attackerState: SoloCombatantState,
    action: SoloCombatActionDefinition,
    active: SoloActiveCombatAction
  ): void {
    const target = active.targetId ? this.runtime.getEntity(active.targetId) : undefined
    const context: SoloCombatUseContext = {
      runtime: this.runtime,
      attacker,
      action,
      target,
      direction: active.direction,
      source: active.source
    }
    if (action.mode === 'projectile') {
      this.spawnProjectile(context)
      action.onResolve?.(context)
      return
    }
    const targets = this.resolveImpactTargets(attacker, attackerState, action, target, active.direction)
    for (const impact of targets) this.applyImpact(context, impact)
    action.onResolve?.(context)
  }

  private resolveRequestedTarget(
    attacker: SoloEntityState,
    attackerState: SoloCombatantState,
    action: SoloCombatActionDefinition,
    requestedId: string | undefined,
    direction: SoloVector
  ): SoloEntityState | undefined | string {
    const targetType = action.target ?? 'enemy'
    if (targetType === 'self') return attacker
    const maxRange = action.range ?? action.projectile?.range ?? 48
    if (requestedId) {
      const target = this.runtime.getEntity(requestedId)
      if (!target) return `Unknown combat target: ${requestedId}`
      if (!this.canTarget(attacker, attackerState, target, targetType)) return `Invalid ${targetType} target: ${requestedId}`
      if (distanceBetween(attacker, target) > maxRange) return `Target ${requestedId} is out of range`
      return target
    }
    const candidates = this.runtime.getEntities(attacker.mapId)
      .filter((target) => this.canTarget(attacker, attackerState, target, targetType))
      .filter((target) => distanceBetween(attacker, target) <= maxRange)
      .filter((target) => withinArc(attacker, target, direction, action.arcDegrees ?? 360))
      .sort((left, right) => distanceBetween(attacker, left) - distanceBetween(attacker, right))
    if (candidates[0]) return candidates[0]
    return targetType === 'any' && action.mode === 'projectile' ? undefined : `No ${targetType} target in range`
  }

  private resolveImpactTargets(
    attacker: SoloEntityState,
    attackerState: SoloCombatantState,
    action: SoloCombatActionDefinition,
    requested: SoloEntityState | undefined,
    direction: SoloVector
  ): SoloEntityState[] {
    const targetType = action.target ?? 'enemy'
    if (targetType === 'self') return [attacker]
    const center = action.area === 'target' && requested ? requested : attacker
    const radius = action.radius ?? action.range ?? 48
    const candidates = this.runtime.getEntities(attacker.mapId)
      .filter((target) => this.canTarget(attacker, attackerState, target, targetType))
      .filter((target) => distanceBetween(center, target) <= radius)
      .filter((target) => center !== attacker || withinArc(attacker, target, direction, action.arcDegrees ?? 120))
      .sort((left, right) => {
        if (left.id === requested?.id) return -1
        if (right.id === requested?.id) return 1
        return distanceBetween(center, left) - distanceBetween(center, right)
      })
    return candidates.slice(0, Math.max(1, action.maxTargets ?? 1))
  }

  private canTarget(
    attacker: SoloEntityState,
    attackerState: SoloCombatantState,
    target: SoloEntityState,
    targetType: 'enemy' | 'ally' | 'self' | 'any'
  ): boolean {
    const targetState = combatState(target)
    if (!targetState || targetState.defeated || target.stats.hp <= 0 || target.mapId !== attacker.mapId) return false
    if (targetType === 'self') return target.id === attacker.id
    if (targetType === 'any') return true
    if (target.id === attacker.id) return targetType === 'ally'
    const allied = targetState.faction === attackerState.faction
    return targetType === 'ally' ? allied : !allied
  }

  private applyImpact(context: SoloCombatUseContext, target: SoloEntityState): void {
    const targetState = combatState(target)
    if (!targetState || targetState.defeated) return
    if (context.action.heal && context.action.heal > 0) {
      const before = target.stats.hp
      target.stats.hp = Math.min(target.stats.maxHp, before + context.action.heal)
      const amount = target.stats.hp - before
      this.emit({
        type: 'healed',
        sourceId: context.attacker.id,
        targetId: target.id,
        actionId: context.action.id,
        amount,
        tick: this.runtime.tick
      })
    }
    if (context.action.damage) this.applyDamage(context, target, targetState)
    for (const status of context.action.applies ?? []) this.applyStatus(target.id, status, context.attacker.id)
  }

  private applyDamage(
    context: SoloCombatUseContext,
    target: SoloEntityState,
    targetState: SoloCombatantState
  ): void {
    if (this.hasStatus(targetState, 'invulnerable')) return
    const definition = context.action.damage
    if (!definition) return
    const raw = (definition.flat ?? 0) +
      (combatState(context.attacker)?.power ?? 0) * (definition.powerScale ?? 1)
    const armor = Math.max(0, targetState.armor * (definition.armorScale ?? 1))
    let damage = Math.max(definition.minimum ?? 1, Math.round(raw * (100 / (100 + armor))))
    let blocked = false
    if (targetState.guarding && this.guardFacesAttacker(target, context.attacker, targetState.guard.arcDegrees)) {
      const cost = targetState.guard.spCostPerHit
      if (target.stats.sp >= cost) {
        target.stats.sp -= cost
        damage = Math.max(0, Math.round(damage * (1 - targetState.guard.damageReduction)))
        blocked = true
      } else {
        targetState.guarding = false
        this.emit({ type: 'guard-changed', entityId: target.id, guarding: false, tick: this.runtime.tick })
      }
    }
    const hitContext: SoloCombatHitContext = {
      runtime: this.runtime,
      attacker: context.attacker,
      target,
      action: context.action,
      damage,
      source: context.source
    }
    const adjustment = context.action.beforeHit?.(hitContext)
    if (adjustment === false) return
    if (typeof adjustment === 'number' && Number.isFinite(adjustment)) damage = Math.max(0, Math.round(adjustment))
    target.stats.hp = Math.max(0, target.stats.hp - damage)
    hitContext.damage = damage
    this.emit({
      type: 'hit',
      attackerId: context.attacker.id,
      targetId: target.id,
      actionId: context.action.id,
      damage,
      blocked,
      tick: this.runtime.tick
    })
    context.action.afterHit?.(hitContext)
    if (target.stats.hp <= 0 && !targetState.defeated) {
      targetState.defeated = true
      targetState.guarding = false
      targetState.active = null
      this.runtime.dispatch({ type: 'stop', entityId: target.id, source: 'system' })
      this.emit({
        type: 'defeated',
        entityId: target.id,
        byEntityId: context.attacker.id,
        actionId: context.action.id,
        tick: this.runtime.tick
      })
    }
  }

  private spawnProjectile(context: SoloCombatUseContext): void {
    const definition = context.action.projectile
    if (!definition) return
    const id = `combat-projectile:${context.attacker.id}:${context.action.id}:${this.runtime.tick}:${++this.projectileCounter}`
    const origin = {
      x: context.attacker.position.x + context.direction.x * 12,
      y: context.attacker.position.y + context.direction.y * 12
    }
    const state: SoloCombatProjectileState = {
      schema: 'rpgjs-solo-action-battle-projectile',
      version: 1,
      attackerId: context.attacker.id,
      actionId: context.action.id,
      source: context.source,
      direction: context.direction,
      remainingRange: definition.range,
      radius: definition.radius ?? 8,
      maxHits: definition.maxHits ?? 1,
      hitIds: [],
      lastPosition: { ...origin },
      spawnTick: this.runtime.tick,
      appearance: definition.appearance
    }
    this.runtime.spawnEntity({
      id,
      kind: 'projectile',
      mapId: context.attacker.mapId,
      x: origin.x,
      y: origin.y,
      hitbox: { radius: state.radius },
      speed: definition.speed,
      data: { [PROJECTILE_KEY]: state as unknown as SoloJsonValue }
    })
    this.runtime.dispatch({ type: 'move', entityId: id, vector: context.direction, speed: definition.speed, source: 'system' })
    this.emit({
      type: 'projectile-spawned',
      projectileId: id,
      attackerId: context.attacker.id,
      actionId: context.action.id,
      tick: this.runtime.tick
    })
  }

  private processProjectile(entity: SoloEntityState, state: SoloCombatProjectileState): void {
    const moved = Math.hypot(
      entity.position.x - state.lastPosition.x,
      entity.position.y - state.lastPosition.y
    )
    state.remainingRange -= moved
    state.lastPosition = { ...entity.position }
    const attacker = this.runtime.getEntity(state.attackerId)
    const attackerState = attacker ? combatState(attacker) : undefined
    const action = this.actions.get(state.actionId)
    if (!attacker || !attackerState || !action || attacker.mapId !== entity.mapId) {
      this.runtime.removeEntity(entity.id)
      return
    }
    const targetType = action.target ?? 'enemy'
    const target = this.runtime.getEntities(entity.mapId)
      .filter((candidate) => !state.hitIds.includes(candidate.id))
      .filter((candidate) => this.canTarget(attacker, attackerState, candidate, targetType))
      .filter((candidate) => distanceBetween(entity, candidate) <= state.radius + collisionRadius(candidate))
      .sort((left, right) => distanceBetween(entity, left) - distanceBetween(entity, right))[0]
    if (target) {
      const context: SoloCombatUseContext = {
        runtime: this.runtime,
        attacker,
        action,
        target,
        direction: state.direction,
        source: state.source
      }
      this.applyImpact(context, target)
      state.hitIds.push(target.id)
      if (state.hitIds.length >= state.maxHits) {
        this.runtime.removeEntity(entity.id)
        return
      }
    }
    if (state.remainingRange <= 0 || (!entity.moving && this.runtime.tick > state.spawnTick + 1)) {
      this.runtime.removeEntity(entity.id)
    }
  }

  private guardFacesAttacker(target: SoloEntityState, attacker: SoloEntityState, arcDegrees: number): boolean {
    return withinArc(target, attacker, facingVector(target), arcDegrees)
  }

  private hasStatus(state: SoloCombatantState, statusId: string): boolean {
    const status = state.statuses[statusId]
    return Boolean(status && status.expiresTick > this.runtime.tick)
  }

  private emit(event: SoloCombatEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
