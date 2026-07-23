import { describe, expect, it, vi } from 'vitest'
import { loadSoloRuntime, MemorySoloSaveStore, saveSoloRuntime, SoloRuntime } from './index'

const createRuntime = () => {
  const runtime = new SoloRuntime()
  runtime.registerMap({ id: 'field', width: 640, height: 480 })
  runtime.registerMap({ id: 'town', width: 800, height: 600 })
  runtime.spawnEntity({ id: 'hero', kind: 'player', mapId: 'field', x: 32, y: 32, speed: 60 })
  return runtime
}

describe('SoloRuntime', () => {
  it('uses one entity identity for human and AI commands', () => {
    const runtime = createRuntime()
    const hero = runtime.getEntity('hero')

    expect(runtime.dispatch({ type: 'move', entityId: 'hero', vector: { x: 1, y: 0 }, source: 'human' }).accepted).toBe(true)
    runtime.stepTicks(30)
    const afterHuman = hero!.position.x

    expect(runtime.dispatch({ type: 'move', entityId: 'hero', vector: { x: 0, y: 1 }, source: 'ai' }).accepted).toBe(true)
    runtime.stepTicks(30)

    expect(runtime.getEntity('hero')).toBe(hero)
    expect(hero!.position.x).toBeGreaterThan(32)
    expect(hero!.position.x).toBeCloseTo(afterHuman)
    expect(hero!.position.y).toBeGreaterThan(32)
    expect(runtime.getCommandLog().map(({ source }) => source)).toEqual(['human', 'ai'])
  })

  it('replays the same commands into the same deterministic state', () => {
    const first = createRuntime()
    const second = createRuntime()
    const commands = [
      { type: 'move', entityId: 'hero', vector: { x: 1, y: 1 }, source: 'replay' },
      { type: 'stop', entityId: 'hero', source: 'replay' }
    ] as const

    first.dispatch(commands[0])
    second.dispatch(commands[0])
    first.stepTicks(45)
    second.stepTicks(45)
    first.dispatch(commands[1])
    second.dispatch(commands[1])
    first.stepTicks(1)
    second.stepTicks(1)

    expect(second.createSnapshot()).toEqual(first.createSnapshot())
  })

  it('pauses fixed stepping and resets accumulated wall time on resume', () => {
    const runtime = createRuntime()
    runtime.dispatch({ type: 'move', entityId: 'hero', vector: { x: 1, y: 0 } })
    runtime.pause()
    expect(runtime.stepTicks(10)).toBe(0)
    expect(runtime.step(1000)).toBe(0)
    expect(runtime.getEntity('hero')!.position.x).toBe(32)

    runtime.resume()
    expect(runtime.step(runtime.fixedStepMs)).toBe(1)
    expect(runtime.getEntity('hero')!.position.x).toBeGreaterThan(32)
  })

  it('transfers maps without replacing the authoritative entity object', () => {
    const runtime = createRuntime()
    const hero = runtime.getEntity('hero')
    const transferred = vi.fn()
    runtime.subscribe((event) => {
      if (event.type === 'entity-transferred') transferred(event.entity)
    })

    runtime.dispatch({
      type: 'transfer-map',
      entityId: 'hero',
      mapId: 'town',
      position: { x: 200, y: 160 },
      source: 'system'
    })

    expect(runtime.getEntity('hero')).toBe(hero)
    expect(hero).toMatchObject({ mapId: 'town', position: { x: 200, y: 160 } })
    expect(runtime.activeMapId).toBe('town')
    expect(transferred).toHaveBeenCalledWith(hero)
  })

  it('runs actions through the same direct command boundary', () => {
    const runtime = createRuntime()
    const handler = vi.fn(({ entity }) => {
      entity.stats.hp -= 12
    })
    runtime.registerAction('take-hit', handler)

    const result = runtime.dispatch({
      type: 'action',
      entityId: 'hero',
      action: 'take-hit',
      payload: { damageType: 'arcane' },
      source: 'ai'
    })

    expect(result.accepted).toBe(true)
    expect(runtime.getEntity('hero')!.stats.hp).toBe(88)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('lets reusable systems reject commands before they enter the log', () => {
    const runtime = createRuntime()
    runtime.registerCommandInterceptor((command) =>
      command.type === 'teleport' ? { accepted: false, reason: 'teleport disabled' } : undefined
    )
    runtime.registerAction('requires-key', () => ({ accepted: false, reason: 'missing key' }))

    expect(runtime.dispatch({
      type: 'teleport',
      entityId: 'hero',
      position: { x: 100, y: 100 },
      source: 'ai'
    })).toMatchObject({ accepted: false, reason: 'teleport disabled' })
    expect(runtime.dispatch({
      type: 'action',
      entityId: 'hero',
      action: 'requires-key',
      source: 'human'
    })).toMatchObject({ accepted: false, reason: 'missing key' })
    expect(runtime.getEntity('hero')!.position).toEqual({ x: 32, y: 32 })
    expect(runtime.getCommandLog()).toHaveLength(0)
  })

  it('round-trips a save without replacing existing entity identity', async () => {
    const runtime = createRuntime()
    const store = new MemorySoloSaveStore()
    const hero = runtime.getEntity('hero')
    runtime.dispatch({ type: 'move', entityId: 'hero', vector: { x: 1, y: 0 } })
    runtime.stepTicks(10)
    await saveSoloRuntime(runtime, store, 'slot-1')
    const savedX = hero!.position.x

    runtime.dispatch({ type: 'teleport', entityId: 'hero', position: { x: 500, y: 300 } })
    expect(await loadSoloRuntime(runtime, store, 'slot-1')).toBe(true)

    expect(runtime.getEntity('hero')).toBe(hero)
    expect(hero!.position.x).toBeCloseTo(savedX)
    expect(await store.list()).toEqual(['slot-1'])
  })

  it('keeps immovable authored objects fixed through overlapping physics', () => {
    const runtime = createRuntime()
    runtime.spawnEntity({
      id: 'ward-lens',
      kind: 'event',
      mapId: 'field',
      x: 160,
      y: 160,
      hitbox: { radius: 5 },
      immovable: true
    })
    runtime.spawnEntity({
      id: 'lens-pedestal',
      kind: 'event',
      mapId: 'field',
      x: 160,
      y: 160,
      hitbox: { radius: 5 },
      immovable: true
    })
    runtime.spawnEntity({
      id: 'scout',
      kind: 'npc',
      mapId: 'field',
      x: 158,
      y: 160,
      hitbox: { radius: 5 },
      speed: 48
    })

    expect(runtime.dispatch({
      type: 'move',
      entityId: 'ward-lens',
      vector: { x: 1, y: 0 },
      source: 'ai'
    })).toMatchObject({ accepted: false, reason: 'Entity is immovable: ward-lens' })
    runtime.dispatch({ type: 'move', entityId: 'scout', vector: { x: 1, y: 0 }, source: 'ai' })
    runtime.stepTicks(600)

    expect(runtime.getEntity('ward-lens')!.position).toEqual({ x: 160, y: 160 })
    expect(runtime.getEntity('lens-pedestal')!.position).toEqual({ x: 160, y: 160 })
  })

  it('persists immovable entities while still allowing system teleports', () => {
    const runtime = createRuntime()
    runtime.spawnEntity({
      id: 'waystone',
      kind: 'event',
      mapId: 'field',
      x: 120,
      y: 96,
      immovable: true
    })

    runtime.dispatch({
      type: 'teleport',
      entityId: 'waystone',
      position: { x: 128, y: 104 },
      source: 'system'
    })
    const snapshot = runtime.createSnapshot()
    runtime.dispatch({
      type: 'teleport',
      entityId: 'waystone',
      position: { x: 300, y: 300 },
      source: 'system'
    })
    runtime.restoreSnapshot(snapshot)

    expect(runtime.getEntity('waystone')).toMatchObject({
      immovable: true,
      position: { x: 128, y: 104 }
    })
  })

  it('keeps teleports, transfers, restores, and fixed-step movement inside map bounds', () => {
    const runtime = new SoloRuntime()
    runtime.registerMap({ id: 'field', width: 100, height: 80 })
    runtime.registerMap({ id: 'room', width: 50, height: 40 })
    runtime.spawnEntity({
      id: 'hero',
      kind: 'player',
      mapId: 'field',
      x: 50,
      y: 40,
      hitbox: { radius: 6 },
      speed: 120
    })

    runtime.dispatch({
      type: 'teleport',
      entityId: 'hero',
      position: { x: 500, y: -100 },
      source: 'system'
    })
    expect(runtime.getEntity('hero')!.position).toEqual({ x: 94, y: 6 })

    runtime.dispatch({ type: 'move', entityId: 'hero', vector: { x: 1, y: -1 } })
    runtime.stepTicks(120)
    expect(runtime.getEntity('hero')).toMatchObject({
      position: { x: 94, y: 6 },
      velocity: { x: 0, y: 0 },
      moving: false
    })

    runtime.dispatch({
      type: 'transfer-map',
      entityId: 'hero',
      mapId: 'room',
      position: { x: 500, y: 500 },
      source: 'system'
    })
    expect(runtime.getEntity('hero')!.position).toEqual({ x: 44, y: 34 })

    const snapshot = runtime.createSnapshot()
    snapshot.entities[0]!.x = -200
    snapshot.entities[0]!.y = 200
    runtime.restoreSnapshot(snapshot)
    expect(runtime.getEntity('hero')!.position).toEqual({ x: 6, y: 34 })
  })

  it('sweeps teleports against authored obstacles unless a script explicitly bypasses collision', () => {
    const runtime = new SoloRuntime()
    runtime.registerMap({
      id: 'fort',
      width: 200,
      height: 100,
      obstacles: [{ id: 'gate', x: 100, y: 50, width: 20, height: 100 }]
    })
    runtime.spawnEntity({
      id: 'hero',
      kind: 'player',
      mapId: 'fort',
      x: 40,
      y: 50,
      hitbox: { radius: 6 }
    })

    runtime.dispatch({
      type: 'teleport',
      entityId: 'hero',
      position: { x: 160, y: 50 },
      source: 'system'
    })
    expect(runtime.getEntity('hero')!.position.x).toBeGreaterThan(40)
    expect(runtime.getEntity('hero')!.position.x).toBeLessThan(84)

    runtime.dispatch({
      type: 'teleport',
      entityId: 'hero',
      position: { x: 160, y: 50 },
      collision: 'ignore',
      source: 'system'
    })
    expect(runtime.getEntity('hero')!.position).toEqual({ x: 160, y: 50 })
  })

  it('replaces authored obstacles without rebuilding the map or its entities', () => {
    const runtime = new SoloRuntime()
    runtime.registerMap({
      id: 'fort',
      width: 200,
      height: 100,
      obstacles: [{ id: 'gate', x: 100, y: 50, width: 20, height: 100 }]
    })
    const hero = runtime.spawnEntity({
      id: 'hero',
      kind: 'player',
      mapId: 'fort',
      x: 40,
      y: 50,
      hitbox: { radius: 6 }
    })

    runtime.replaceMapObstacles('fort', [])
    runtime.dispatch({
      type: 'teleport',
      entityId: 'hero',
      position: { x: 160, y: 50 },
      source: 'system'
    })

    expect(runtime.getEntity('hero')).toBe(hero)
    expect(hero.position).toEqual({ x: 160, y: 50 })
    expect(runtime.getMap('fort')?.obstacles).toEqual([])
  })

  it('rejects invalid replacement obstacle tables before mutating physics', () => {
    const runtime = new SoloRuntime()
    const gate = { id: 'gate', x: 100, y: 50, width: 20, height: 100 }
    runtime.registerMap({ id: 'fort', width: 200, height: 100, obstacles: [gate] })

    expect(() => runtime.replaceMapObstacles('fort', [gate, gate])).toThrow(/unique/)
    expect(runtime.getMap('fort')?.obstacles).toEqual([gate])
  })
})
