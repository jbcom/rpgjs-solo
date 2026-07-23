import { describe, expect, it, vi } from 'vitest'
import { SoloRuntime } from '@jbcom/rpgjs-solo'
import { SoloActionBattle } from './runtime'
import type { SoloCombatEvent } from './types'

const createBattle = () => {
  const runtime = new SoloRuntime()
  runtime.registerMap({ id: 'field', width: 640, height: 480 })
  runtime.spawnEntity({
    id: 'hero',
    kind: 'player',
    mapId: 'field',
    x: 40,
    y: 80,
    direction: 'right',
    stats: { hp: 100, maxHp: 100, sp: 20, maxSp: 20 }
  })
  runtime.spawnEntity({
    id: 'enemy',
    kind: 'event',
    mapId: 'field',
    x: 68,
    y: 80,
    direction: 'left',
    stats: { hp: 100, maxHp: 100, sp: 10, maxSp: 10 }
  })
  const battle = new SoloActionBattle(runtime)
  return { runtime, battle }
}

describe('SoloActionBattle', () => {
  it('answers action and movement availability without speculative commands', () => {
    const { runtime, battle } = createBattle()
    battle.registerAction({
      id: 'measured-slash',
      name: 'Measured Slash',
      mode: 'melee',
      range: 40,
      spCost: 2,
      damage: { flat: 10, powerScale: 0 },
      profile: { startupTicks: 2, activeTicks: 1, recoveryTicks: 2, cooldownTicks: 8 }
    })
    battle.registerCombatant('hero', { faction: 'crown', actions: ['measured-slash'] })
    battle.registerCombatant('enemy', { faction: 'hollow', actions: [] })
    const payload = { actionId: 'measured-slash', targetId: 'enemy' }

    expect(battle.canUseAction('hero', payload, 'ai')).toEqual({ available: true })
    expect(runtime.getEntity('hero')!.stats.sp).toBe(20)
    expect(runtime.getCommandLog()).toHaveLength(0)

    runtime.dispatch({ type: 'action', entityId: 'hero', action: 'combat:use', payload, source: 'ai' })
    expect(battle.canUseAction('hero', payload, 'ai')).toEqual({
      available: false,
      reason: 'Combatant is already using measured-slash'
    })
    expect(battle.canMove('hero').available).toBe(false)

    runtime.stepTicks(5)
    expect(battle.canMove('hero')).toEqual({ available: true })
    expect(battle.canUseAction('hero', payload, 'ai')).toEqual({
      available: false,
      reason: 'measured-slash is on cooldown until tick 8'
    })
    runtime.stepTicks(3)
    expect(battle.canUseAction('hero', payload, 'ai')).toEqual({ available: true })
  })

  it('starts attacker-centred area actions without an enemy target', () => {
    const { runtime, battle } = createBattle()
    const resolved = vi.fn()
    battle.registerAction({
      id: 'emberbrand',
      name: 'Emberbrand',
      mode: 'melee',
      area: 'attacker',
      range: 10,
      radius: 10,
      spCost: 5,
      damage: { flat: 10, powerScale: 0 },
      profile: { startupTicks: 0, activeTicks: 1, recoveryTicks: 1, cooldownTicks: 8 },
      onResolve: resolved
    })
    battle.registerCombatant('hero', { faction: 'crown', actions: ['emberbrand'] })
    battle.registerCombatant('enemy', { faction: 'hollow', actions: [] })
    const payload = { actionId: 'emberbrand', direction: { x: 1, y: 0 } }

    expect(battle.canUseAction('hero', payload)).toEqual({ available: true })
    expect(runtime.dispatch({
      type: 'action',
      entityId: 'hero',
      action: 'combat:use',
      payload,
      source: 'human'
    })).toMatchObject({ accepted: true })
    expect(battle.getCombatant('hero')!.active?.targetId).toBeUndefined()
    expect(runtime.getEntity('hero')!.stats.sp).toBe(15)

    runtime.stepTicks(1)
    expect(resolved).toHaveBeenCalledOnce()
    expect(runtime.getEntity('enemy')!.stats.hp).toBe(100)
  })

  it('runs startup, active, recovery, damage, cooldown, and movement lock in fixed ticks', () => {
    const { runtime, battle } = createBattle()
    const events: SoloCombatEvent[] = []
    battle.subscribe((event) => events.push(event))
    battle.registerAction({
      id: 'sword',
      name: 'Sword Arc',
      mode: 'melee',
      range: 40,
      arcDegrees: 100,
      damage: { powerScale: 1 },
      profile: { startupTicks: 2, activeTicks: 1, recoveryTicks: 2, cooldownTicks: 5 }
    })
    battle.registerCombatant('hero', { faction: 'crown', actions: ['sword'], power: 20 })
    battle.registerCombatant('enemy', { faction: 'hollow', actions: [], armor: 0 })

    expect(runtime.dispatch({
      type: 'action',
      entityId: 'hero',
      action: 'combat:use',
      payload: { actionId: 'sword', targetId: 'enemy' },
      source: 'human'
    }).accepted).toBe(true)
    expect(runtime.dispatch({
      type: 'move',
      entityId: 'hero',
      vector: { x: 1, y: 0 },
      source: 'human'
    })).toMatchObject({ accepted: false, reason: 'Movement is locked during sword' })

    runtime.stepTicks(1)
    expect(runtime.getEntity('enemy')!.stats.hp).toBe(100)
    runtime.stepTicks(1)
    expect(runtime.getEntity('enemy')!.stats.hp).toBe(80)
    runtime.stepTicks(3)
    expect(battle.getCombatant('hero')!.active).toBeNull()
    expect(events.map((event) => event.type)).toEqual([
      'action-started',
      'action-phase',
      'hit',
      'action-phase',
      'action-finished'
    ])
    expect(runtime.dispatch({
      type: 'action',
      entityId: 'hero',
      action: 'combat:use',
      payload: { actionId: 'sword', targetId: 'enemy' },
      source: 'ai'
    }).accepted).toBe(true)
  })

  it('applies directional guard reduction and spends guard resource', () => {
    const { runtime, battle } = createBattle()
    const hit = vi.fn()
    battle.subscribe((event) => {
      if (event.type === 'hit') hit(event)
    })
    battle.registerAction({
      id: 'claw',
      name: 'Claw',
      mode: 'melee',
      range: 40,
      damage: { flat: 20, powerScale: 0 },
      profile: { startupTicks: 0, activeTicks: 1, recoveryTicks: 0 }
    })
    battle.registerCombatant('hero', { faction: 'crown', actions: ['claw'], power: 0 })
    battle.registerCombatant('enemy', {
      faction: 'hollow',
      actions: [],
      guard: { arcDegrees: 120, damageReduction: 0.5, spCostPerHit: 3 }
    })
    expect(runtime.dispatch({
      type: 'action',
      entityId: 'enemy',
      action: 'combat:guard',
      payload: { active: true }
    }).accepted).toBe(true)
    runtime.dispatch({
      type: 'action',
      entityId: 'hero',
      action: 'combat:use',
      payload: { actionId: 'claw', targetId: 'enemy' }
    })
    runtime.stepTicks(1)

    expect(runtime.getEntity('enemy')!.stats.hp).toBe(90)
    expect(runtime.getEntity('enemy')!.stats.sp).toBe(7)
    expect(hit).toHaveBeenCalledWith(expect.objectContaining({ damage: 10, blocked: true }))
  })

  it('moves projectiles through Solo physics and resolves impacts without a transport copy', () => {
    const { runtime, battle } = createBattle()
    runtime.getEntity('hero')!.direction = 'left'
    runtime.dispatch({ type: 'teleport', entityId: 'enemy', position: { x: 110, y: 80 }, source: 'system' })
    battle.registerAction({
      id: 'arrow',
      name: 'Longbow Shot',
      mode: 'projectile',
      target: 'enemy',
      damage: { flat: 24, powerScale: 0 },
      projectile: { speed: 600, range: 120, radius: 8, appearance: 'arrow' },
      profile: { startupTicks: 0, activeTicks: 1, recoveryTicks: 1 }
    })
    battle.registerCombatant('hero', { faction: 'crown', actions: ['arrow'], power: 0 })
    battle.registerCombatant('enemy', { faction: 'hollow', actions: [] })

    expect(runtime.dispatch({
      type: 'action',
      entityId: 'hero',
      action: 'combat:use',
      payload: { actionId: 'arrow', targetId: 'enemy' },
      source: 'ai'
    }).accepted).toBe(true)
    runtime.stepTicks(10)

    expect(runtime.getEntity('enemy')!.stats.hp).toBe(76)
    expect(runtime.getEntities().filter((entity) => entity.kind === 'projectile')).toHaveLength(0)
  })

  it('lets projectile sensors pass defeated body blockers to reach a live target', () => {
    const { runtime, battle } = createBattle()
    runtime.dispatch({ type: 'teleport', entityId: 'enemy', position: { x: 140, y: 80 }, source: 'system' })
    runtime.spawnEntity({
      id: 'defeated-body',
      kind: 'event',
      mapId: 'field',
      x: 80,
      y: 80,
      stats: { hp: 0, maxHp: 100 }
    })
    battle.registerAction({
      id: 'arc-bolt',
      name: 'Arc Bolt',
      mode: 'projectile',
      target: 'enemy',
      damage: { flat: 24, powerScale: 0 },
      projectile: { speed: 600, range: 160, radius: 8 },
      profile: { startupTicks: 0, activeTicks: 1, recoveryTicks: 1 }
    })
    battle.registerCombatant('hero', { faction: 'crown', actions: ['arc-bolt'], power: 0 })
    battle.registerCombatant('enemy', { faction: 'hollow', actions: [] })
    battle.registerCombatant('defeated-body', { faction: 'hollow', actions: [] })

    expect(runtime.dispatch({
      type: 'action',
      entityId: 'hero',
      action: 'combat:use',
      payload: { actionId: 'arc-bolt', targetId: 'enemy' },
      source: 'ai'
    }).accepted).toBe(true)
    runtime.stepTicks(20)

    expect(runtime.getEntity('enemy')!.stats.hp).toBe(76)
  })

  it('keeps projectile sensors blocked by authored map collision', () => {
    const { runtime, battle } = createBattle()
    runtime.dispatch({ type: 'teleport', entityId: 'enemy', position: { x: 140, y: 80 }, source: 'system' })
    runtime.replaceMapObstacles('field', [
      { id: 'stone-wall', x: 80, y: 80, width: 16, height: 80 }
    ])
    battle.registerAction({
      id: 'arc-bolt',
      name: 'Arc Bolt',
      mode: 'projectile',
      target: 'enemy',
      damage: { flat: 24, powerScale: 0 },
      projectile: { speed: 600, range: 160, radius: 8 },
      profile: { startupTicks: 0, activeTicks: 1, recoveryTicks: 1 }
    })
    battle.registerCombatant('hero', { faction: 'crown', actions: ['arc-bolt'], power: 0 })
    battle.registerCombatant('enemy', { faction: 'hollow', actions: [] })

    runtime.dispatch({
      type: 'action',
      entityId: 'hero',
      action: 'combat:use',
      payload: { actionId: 'arc-bolt', targetId: 'enemy' },
      source: 'ai'
    })
    runtime.stepTicks(20)

    expect(runtime.getEntity('enemy')!.stats.hp).toBe(100)
  })

  it('persists statuses and combat state in the authoritative Solo snapshot', () => {
    const { runtime, battle } = createBattle()
    battle.registerAction({ id: 'wait', name: 'Wait', mode: 'instant', target: 'self' })
    battle.registerCombatant('hero', { faction: 'crown', actions: ['wait'] })
    battle.registerCombatant('enemy', { faction: 'hollow', actions: [] })
    battle.applyStatus('hero', { id: 'root', durationTicks: 3 })

    expect(runtime.dispatch({
      type: 'move',
      entityId: 'hero',
      vector: { x: 1, y: 0 }
    })).toMatchObject({ accepted: false, reason: 'Combatant is rooted' })
    const snapshot = runtime.createSnapshot()
    runtime.stepTicks(3)
    expect(runtime.dispatch({
      type: 'move',
      entityId: 'hero',
      vector: { x: 1, y: 0 }
    }).accepted).toBe(true)

    runtime.restoreSnapshot(snapshot)
    expect(battle.getCombatant('hero')!.statuses.root).toMatchObject({ expiresTick: 3 })
    expect(runtime.dispatch({
      type: 'move',
      entityId: 'hero',
      vector: { x: 1, y: 0 }
    }).accepted).toBe(false)
  })

  it('honors the inherited repeated-hit profile policy without wall-clock timers', () => {
    const { runtime, battle } = createBattle()
    battle.registerAction({
      id: 'storm',
      name: 'Storm Field',
      mode: 'instant',
      range: 40,
      damage: { flat: 3, powerScale: 0 },
      profile: {
        startupTicks: 0,
        activeTicks: 3,
        recoveryTicks: 0,
        hitPolicy: 'allowRepeatHits'
      }
    })
    battle.registerCombatant('hero', { faction: 'crown', actions: ['storm'], power: 0 })
    battle.registerCombatant('enemy', { faction: 'hollow', actions: [] })
    runtime.dispatch({
      type: 'action',
      entityId: 'hero',
      action: 'combat:use',
      payload: { actionId: 'storm', targetId: 'enemy' }
    })

    runtime.stepTicks(3)
    expect(runtime.getEntity('enemy')!.stats.hp).toBe(91)
  })
})
