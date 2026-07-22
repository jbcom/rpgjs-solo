import type {
  SoloCommandSource,
  SoloEntityState,
  SoloJsonValue,
  SoloRuntime,
  SoloVector
} from '@jbcom/rpgjs-solo'

export type SoloCombatActionMode = 'instant' | 'melee' | 'projectile'
export type SoloCombatTarget = 'enemy' | 'ally' | 'self' | 'any'
export type SoloCombatPhase = 'startup' | 'active' | 'recovery'

export interface SoloAttackProfile {
  id?: string
  startupTicks?: number
  activeTicks?: number
  recoveryTicks?: number
  cooldownTicks?: number
  movementLock?: boolean
  directionLock?: boolean
  hitPolicy?: 'oncePerTarget' | 'allowRepeatHits'
}

export interface NormalizedSoloAttackProfile {
  id: string
  startupTicks: number
  activeTicks: number
  recoveryTicks: number
  cooldownTicks: number
  movementLock: boolean
  directionLock: boolean
  hitPolicy: 'oncePerTarget' | 'allowRepeatHits'
  totalTicks: number
}

export interface SoloCombatDamageDefinition {
  flat?: number
  powerScale?: number
  armorScale?: number
  minimum?: number
}

export interface SoloCombatStatusDefinition {
  id: string
  durationTicks: number
  stacks?: number
  maxStacks?: number
  data?: Record<string, SoloJsonValue>
}

export interface SoloCombatProjectileDefinition {
  speed: number
  range: number
  radius?: number
  maxHits?: number
  appearance?: string
}

export interface SoloCombatUseContext {
  runtime: SoloRuntime
  attacker: SoloEntityState
  action: SoloCombatActionDefinition
  target: SoloEntityState | undefined
  direction: SoloVector
  source: SoloCommandSource
}

export interface SoloCombatHitContext {
  runtime: SoloRuntime
  attacker: SoloEntityState
  target: SoloEntityState
  action: SoloCombatActionDefinition
  damage: number
  source: SoloCommandSource
}

export interface SoloCombatActionDefinition {
  id: string
  name: string
  mode: SoloCombatActionMode
  target?: SoloCombatTarget
  profile?: SoloAttackProfile
  range?: number
  arcDegrees?: number
  radius?: number
  area?: 'attacker' | 'target'
  maxTargets?: number
  spCost?: number
  damage?: SoloCombatDamageDefinition
  heal?: number
  projectile?: SoloCombatProjectileDefinition
  applies?: readonly SoloCombatStatusDefinition[]
  requiresStatuses?: readonly string[]
  consumesStatuses?: readonly string[]
  canUse?: (context: SoloCombatUseContext) => boolean | string
  beforeHit?: (context: SoloCombatHitContext) => false | number | void
  afterHit?: (context: SoloCombatHitContext) => void
  onResolve?: (context: SoloCombatUseContext) => void
}

export interface SoloGuardDefinition {
  arcDegrees?: number
  damageReduction?: number
  spCostPerHit?: number
}

export interface SoloCombatantDefinition {
  faction: string
  actions: readonly string[]
  power?: number
  armor?: number
  guard?: SoloGuardDefinition
}

export interface SoloCombatStatusState {
  id: string
  stacks: number
  expiresTick: number
  sourceId?: string
  data?: Record<string, SoloJsonValue>
}

export interface SoloActiveCombatAction {
  id: string
  source: SoloCommandSource
  targetId?: string
  direction: SoloVector
  phase: SoloCombatPhase
  startedTick: number
  activeTick: number
  recoveryTick: number
  endsTick: number
  resolved: boolean
}

export interface SoloCombatantState {
  schema: 'rpgjs-solo-action-battle'
  version: 1
  faction: string
  actions: string[]
  power: number
  armor: number
  guard: Required<SoloGuardDefinition>
  guarding: boolean
  cooldownUntil: Record<string, number>
  statuses: Record<string, SoloCombatStatusState>
  active: SoloActiveCombatAction | null
  defeated: boolean
}

export interface SoloCombatUsePayload {
  actionId: string
  targetId?: string
  direction?: SoloVector
}

export interface SoloCombatGuardPayload {
  active: boolean
}

/** A side-effect-free answer used by human UI and AI before dispatch. */
export interface SoloCombatAvailability {
  available: boolean
  reason?: string
}

export type SoloCombatEvent =
  | { type: 'action-started'; entityId: string; actionId: string; targetId?: string; tick: number }
  | { type: 'action-phase'; entityId: string; actionId: string; phase: SoloCombatPhase; tick: number }
  | { type: 'action-finished'; entityId: string; actionId: string; tick: number }
  | { type: 'guard-changed'; entityId: string; guarding: boolean; tick: number }
  | { type: 'hit'; attackerId: string; targetId: string; actionId: string; damage: number; blocked: boolean; tick: number }
  | { type: 'healed'; sourceId: string; targetId: string; actionId: string; amount: number; tick: number }
  | { type: 'status-applied'; targetId: string; statusId: string; stacks: number; expiresTick: number; tick: number }
  | { type: 'status-expired'; targetId: string; statusId: string; tick: number }
  | { type: 'projectile-spawned'; projectileId: string; attackerId: string; actionId: string; tick: number }
  | { type: 'defeated'; entityId: string; byEntityId: string; actionId: string; tick: number }

export type SoloCombatListener = (event: SoloCombatEvent) => void
