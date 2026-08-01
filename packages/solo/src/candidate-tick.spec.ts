import { describe, expect, it } from 'vitest'
import {
  SoloCandidateTickConflictError,
  SoloCandidateTickError,
  SoloRuntime,
  type SoloDomainEvent,
  type SoloRuntimeEvent
} from './index'

interface JournalState {
  records: string[]
}

interface DamageAccepted extends SoloDomainEvent {
  type: 'DAMAGE_ACCEPTED'
  payload: { entityId: string; amount: number }
}

const createRuntime = () => {
  const runtime = new SoloRuntime()
  runtime.registerMap({ id: 'field', width: 640, height: 480 })
  runtime.spawnEntity({ id: 'hero', kind: 'player', mapId: 'field', x: 32, y: 32, speed: 60 })
  runtime.registerAction('take-hit', ({ entity, payload }) => {
    const amount = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? Number(payload.amount)
      : 0
    entity.stats.hp -= amount
  }, { candidateSafe: true })
  return runtime
}

const damageEvent = (tick: number, id = `damage:${tick}`): DamageAccepted => ({
  id,
  type: 'DAMAGE_ACCEPTED',
  tick,
  payload: { entityId: 'hero', amount: 12 }
})

const appendDamage = (state: Readonly<JournalState>, event: Readonly<DamageAccepted>): JournalState => ({
  records: [...state.records, `${event.payload.entityId}:${event.payload.amount}`]
})

describe('Solo candidate ticks', () => {
  it('discards an earlier accepted dispatch and every egress event when aborted', () => {
    const runtime = createRuntime()
    const hero = runtime.getEntity('hero')!
    const runtimeEvents: SoloRuntimeEvent[] = []
    const publications: unknown[] = []
    runtime.subscribe((event) => runtimeEvents.push(event))
    runtime.subscribeCandidateTicks((publication) => publications.push(publication))

    const candidate = runtime.beginCandidateTick<JournalState>({
      id: 'attempt-1',
      state: { records: [] },
      expectedBaseTick: 0
    })
    expect(candidate.dispatchAndReduce(
      { type: 'action', entityId: 'hero', action: 'take-hit', payload: { amount: 12 }, source: 'ai' },
      damageEvent(candidate.tick),
      appendDamage
    ).accepted).toBe(true)
    expect(candidate.getEntity('hero')!.stats.hp).toBe(88)
    expect(hero.stats.hp).toBe(100)
    expect(runtime.tick).toBe(0)
    expect(runtime.getCommandLog()).toHaveLength(0)

    candidate.abort()

    expect(candidate.status).toBe('aborted')
    expect(hero.stats.hp).toBe(100)
    expect(runtime.tick).toBe(0)
    expect(runtime.getCommandLog()).toHaveLength(0)
    expect(runtimeEvents).toEqual([])
    expect(publications).toEqual([])
  })

  it('buffers tick, command, and domain egress until one atomic publication', () => {
    const runtime = createRuntime()
    const hero = runtime.getEntity('hero')!
    const ordering: string[] = []
    const runtimeEvents: SoloRuntimeEvent[] = []
    runtime.subscribeCandidateTicks((publication) => {
      ordering.push('publication')
      expect(runtime.tick).toBe(1)
      expect(runtime.getEntity('hero')).not.toBe(hero)
      expect(runtime.getEntity('hero')!.stats.hp).toBe(88)
      expect(publication.state).toEqual({ records: ['hero:12'] })
      expect(publication.runtimeEvents.map(({ type }) => type)).toEqual(['tick', 'command'])
      expect(publication.domainEvents.map(({ type }) => type)).toEqual(['DAMAGE_ACCEPTED'])
    })
    runtime.subscribe((event) => {
      ordering.push(`runtime:${event.type}`)
      runtimeEvents.push(event)
    })

    const candidate = runtime.beginCandidateTick<JournalState>({
      id: 'commit-1',
      state: { records: [] }
    })
    candidate.dispatchAndReduce(
      { type: 'action', entityId: 'hero', action: 'take-hit', payload: { amount: 12 }, source: 'ai' },
      damageEvent(candidate.tick),
      appendDamage
    )

    expect(runtime.tick).toBe(0)
    expect(hero.stats.hp).toBe(100)
    expect(runtimeEvents).toEqual([])
    expect(ordering).toEqual([])

    const publication = candidate.commit()

    expect(candidate.status).toBe('committed')
    expect(runtime.tick).toBe(1)
    expect(runtime.getEntity('hero')).not.toBe(hero)
    expect(runtime.getEntity('hero')!.stats.hp).toBe(88)
    expect(hero.stats.hp).toBe(100)
    expect(publication.state).toEqual({ records: ['hero:12'] })
    expect(Object.isFrozen(publication)).toBe(true)
    expect(Object.isFrozen(publication.state)).toBe(true)
    expect(Object.isFrozen(publication.view)).toBe(true)
    expect(Object.isFrozen(publication.view.entities)).toBe(true)
    expect(Object.isFrozen(publication.view.entities[0])).toBe(true)
    expect(Object.isFrozen(publication.view.entities[0]!.stats)).toBe(true)
    expect(Object.isFrozen(publication.runtimeEvents)).toBe(true)
    expect(Object.isFrozen(publication.runtimeEvents[0])).toBe(true)
    expect(publication.runtimeEvents[0]!.type).toBe('tick')
    if (publication.runtimeEvents[0]!.type === 'tick') {
      expect(Object.isFrozen(publication.runtimeEvents[0]!.view)).toBe(true)
      expect(Object.isFrozen(publication.runtimeEvents[0]!.view.entities[0])).toBe(true)
    }
    expect(ordering).toEqual(['publication', 'runtime:tick', 'runtime:command'])
    expect(runtime.getCommandLog()).toHaveLength(1)
  })

  it('turns reducer failure into a failed candidate without leaking prior Rules mutation', () => {
    const runtime = createRuntime()
    const runtimeEvents: SoloRuntimeEvent[] = []
    runtime.subscribe((event) => runtimeEvents.push(event))
    const candidate = runtime.beginCandidateTick<JournalState>({
      id: 'bad-reducer',
      state: { records: [] }
    })

    expect(() => candidate.dispatchAndReduce(
      { type: 'action', entityId: 'hero', action: 'take-hit', payload: { amount: 12 }, source: 'ai' },
      damageEvent(candidate.tick),
      () => {
        throw new Error('invalid narrative authority')
      }
    )).toThrow('invalid narrative authority')

    expect(candidate.status).toBe('failed')
    expect(() => candidate.commit()).toThrow(SoloCandidateTickError)
    expect(runtime.tick).toBe(0)
    expect(runtime.getEntity('hero')!.stats.hp).toBe(100)
    expect(runtime.getCommandLog()).toHaveLength(0)
    expect(runtimeEvents).toEqual([])
    candidate.abort()
  })

  it('retries the same fixed tick after abort and advances exactly one tick after commit', () => {
    const runtime = createRuntime()
    const first = runtime.beginCandidateTick({ id: 'first', state: { records: [] } })
    expect(first.baseTick).toBe(0)
    expect(first.tick).toBe(1)
    first.abort()

    const retry = runtime.beginCandidateTick({ id: 'retry', state: { records: [] } })
    expect(retry.baseTick).toBe(0)
    expect(retry.tick).toBe(1)
    retry.commit()
    expect(runtime.tick).toBe(1)

    const next = runtime.beginCandidateTick({ id: 'next', state: { records: [] } })
    expect(next.baseTick).toBe(1)
    expect(next.tick).toBe(2)
    next.abort()
  })

  it('rejects stale publication after the committed runtime changes', () => {
    const runtime = createRuntime()
    const publications: unknown[] = []
    runtime.subscribeCandidateTicks((publication) => publications.push(publication))
    const stale = runtime.beginCandidateTick({ id: 'stale', state: { records: [] } })

    runtime.dispatch({ type: 'move', entityId: 'hero', vector: { x: 1, y: 0 }, source: 'human' })

    expect(() => stale.commit()).toThrow(SoloCandidateTickConflictError)
    expect(stale.status).toBe('aborted')
    expect(runtime.tick).toBe(0)
    expect(runtime.getCommandLog()).toHaveLength(1)
    expect(publications).toEqual([])
  })

  it('does not fabricate candidate ticks while paused', () => {
    const runtime = createRuntime()
    runtime.pause()
    expect(() => runtime.beginCandidateTick({ id: 'paused', state: null }))
      .toThrow('A paused runtime cannot begin a candidate tick')
    expect(runtime.tick).toBe(0)
  })

  it('fails closed for action and interceptor closures not explicitly marked candidate-safe', () => {
    const runtime = new SoloRuntime()
    runtime.registerMap({ id: 'field', width: 640, height: 480 })
    runtime.spawnEntity({ id: 'hero', kind: 'player', mapId: 'field', x: 32, y: 32 })
    let leakedActionCalls = 0
    let leakedInterceptorCalls = 0
    runtime.registerAction('unsafe-action', () => {
      leakedActionCalls += 1
    })
    runtime.registerCommandInterceptor(() => {
      leakedInterceptorCalls += 1
    })

    const candidate = runtime.beginCandidateTick({ id: 'safe-boundary', state: null })
    expect(candidate.dispatch({
      type: 'action', entityId: 'hero', action: 'unsafe-action', source: 'ai'
    })).toMatchObject({ accepted: false, reason: 'Unknown action: unsafe-action' })
    expect(candidate.dispatch({
      type: 'move', entityId: 'hero', vector: { x: 1, y: 0 }, source: 'ai'
    }).accepted).toBe(true)
    expect(leakedActionCalls).toBe(0)
    expect(leakedInterceptorCalls).toBe(0)
    candidate.abort()
  })

  it('commits despite throwing publication and legacy listeners and reports every error', () => {
    const runtime = createRuntime()
    const publications: number[] = []
    const runtimeEvents: string[] = []
    const failures: string[] = []
    runtime.subscribeCandidateTicks(() => {
      throw new Error('publication observer failed')
    })
    runtime.subscribeCandidateTicks((publication) => publications.push(publication.tick))
    runtime.subscribe(() => {
      throw new Error('legacy observer failed')
    })
    runtime.subscribe((event) => runtimeEvents.push(event.type))
    runtime.subscribeCandidateTickErrors((failure) => {
      failures.push(`${failure.phase}:${failure.runtimeEventType ?? 'batch'}`)
    })

    const candidate = runtime.beginCandidateTick({ id: 'listener-errors', state: null })
    candidate.dispatch({ type: 'stop', entityId: 'hero', source: 'ai' })
    const publication = candidate.commit()

    expect(publication.tick).toBe(1)
    expect(candidate.status).toBe('committed')
    expect(runtime.tick).toBe(1)
    expect(publications).toEqual([1])
    expect(runtimeEvents).toEqual(['tick', 'command'])
    expect(failures).toEqual([
      'candidate-publication:batch',
      'legacy-runtime-event:tick',
      'legacy-runtime-event:command'
    ])
  })

  it('closes the candidate before publication listeners can re-enter it', () => {
    const runtime = createRuntime()
    let candidate: ReturnType<typeof runtime.beginCandidateTick>
    const reentryErrors: string[] = []
    runtime.subscribeCandidateTicks(() => {
      expect(candidate.status).toBe('committed')
      for (const operation of [
        () => candidate.abort(),
        () => candidate.commit(),
        () => candidate.dispatch({ type: 'stop', entityId: 'hero', source: 'ai' })
      ]) {
        try {
          operation()
        } catch (error) {
          reentryErrors.push((error as Error).message)
        }
      }
    })

    candidate = runtime.beginCandidateTick({ id: 'closed-before-publication', state: null })
    candidate.commit()

    expect(runtime.tick).toBe(1)
    expect(candidate.status).toBe('committed')
    expect(reentryErrors).toEqual([
      'Candidate closed-before-publication has already committed',
      'Candidate closed-before-publication is committed',
      'Candidate closed-before-publication is committed'
    ])
  })

  it('atomically replaces the authority graph without mutating frozen or earlier live entities', () => {
    const runtime = createRuntime()
    const oldHero = runtime.getEntity('hero')!
    const oldGuard = runtime.spawnEntity({
      id: 'guard', kind: 'npc', mapId: 'field', x: 64, y: 32
    })
    Object.freeze(oldGuard)

    const candidate = runtime.beginCandidateTick({ id: 'frozen-live-graph', state: null })
    candidate.dispatch({
      type: 'action', entityId: 'hero', action: 'take-hit', payload: { amount: 12 }, source: 'ai'
    })

    expect(() => candidate.commit()).not.toThrow()
    expect(candidate.status).toBe('committed')
    expect(runtime.tick).toBe(1)
    expect(runtime.getEntity('hero')).not.toBe(oldHero)
    expect(runtime.getEntity('guard')).not.toBe(oldGuard)
    expect(runtime.getEntity('hero')!.stats.hp).toBe(88)
    expect(oldHero.stats.hp).toBe(100)
  })

  it('commits large live and candidate command logs without variadic argument overflow', () => {
    const runtime = createRuntime()
    const command = { type: 'stop', entityId: 'hero', source: 'ai' } as const
    for (let index = 0; index < 80_000; index += 1) runtime.dispatch(command)
    const candidate = runtime.beginCandidateTick({ id: 'large-command-log', state: null })
    for (let index = 0; index < 80_000; index += 1) candidate.dispatch(command)

    expect(() => candidate.commit()).not.toThrow()
    expect(candidate.status).toBe('committed')
    expect(runtime.tick).toBe(1)
    expect(runtime.getCommandLog()).toHaveLength(160_000)
  })

  it('strictly clones and freezes candidate commands before executable authority receives them', () => {
    const runtime = new SoloRuntime()
    runtime.registerMap({ id: 'field', width: 640, height: 480 })
    runtime.spawnEntity({ id: 'hero', kind: 'player', mapId: 'field', x: 32, y: 32 })
    runtime.registerAction('mutate-payload', ({ payload }) => {
      ;(payload as { value: number }).value = 99
    }, { candidateSafe: true })
    const callerPayload = { value: 1 }
    const candidate = runtime.beginCandidateTick({ id: 'frozen-input', state: null })

    expect(() => candidate.dispatch({
      type: 'action', entityId: 'hero', action: 'mutate-payload', payload: callerPayload, source: 'ai'
    })).toThrow(TypeError)
    expect(callerPayload).toEqual({ value: 1 })
    expect(candidate.status).toBe('failed')
    expect(runtime.tick).toBe(0)
    expect(runtime.getCommandLog()).toHaveLength(0)
    candidate.abort()
  })

  it('invalidates a candidate when executable authority is unregistered and replaced under the same name', () => {
    const runtime = new SoloRuntime()
    runtime.registerMap({ id: 'field', width: 640, height: 480 })
    runtime.spawnEntity({ id: 'hero', kind: 'player', mapId: 'field', x: 32, y: 32 })
    const unregister = runtime.registerAction('authority', ({ entity }) => {
      entity.stats.hp -= 10
    }, { candidateSafe: true })
    const stale = runtime.beginCandidateTick({ id: 'old-authority', state: null })
    stale.dispatch({ type: 'action', entityId: 'hero', action: 'authority', source: 'ai' })

    unregister()
    runtime.registerAction('authority', ({ entity }) => {
      entity.stats.hp -= 20
    }, { candidateSafe: true })

    expect(() => stale.commit()).toThrow(SoloCandidateTickConflictError)
    expect(stale.status).toBe('aborted')
    expect(runtime.tick).toBe(0)
    expect(runtime.getEntity('hero')!.stats.hp).toBe(100)
  })

  it('rejects nested candidate publication and preserves all outer event tick identities', () => {
    const runtime = createRuntime()
    const publicationTicks: number[] = []
    const legacyTicks: number[] = []
    let nestedError: unknown
    runtime.subscribeCandidateTicks((publication) => {
      publicationTicks.push(publication.tick)
      try {
        runtime.beginCandidateTick({ id: 'nested', state: null }).commit()
      } catch (error) {
        nestedError = error
      }
    })
    runtime.subscribe((event) => {
      if (event.type === 'tick') legacyTicks.push(event.view.tick)
      if (event.type === 'command') legacyTicks.push(event.record.tick)
    })

    const outer = runtime.beginCandidateTick({ id: 'outer', state: null })
    outer.dispatch({ type: 'stop', entityId: 'hero', source: 'ai' })
    outer.commit()

    expect(nestedError).toBeInstanceOf(SoloCandidateTickConflictError)
    expect(publicationTicks).toEqual([1])
    expect(legacyTicks).toEqual([1, 1])
    expect(runtime.tick).toBe(1)
  })

  it('deeply freezes every candidate inspection surface at runtime', () => {
    const runtime = createRuntime()
    const candidate = runtime.beginCandidateTick({ id: 'readonly-inspection', state: null })
    candidate.dispatch({ type: 'stop', entityId: 'hero', source: 'ai' })

    const view = candidate.getView()
    const entity = candidate.getEntity('hero')!
    const map = candidate.getMap('field')!
    const commandLog = candidate.getCommandLog()

    expect(Object.isFrozen(view)).toBe(true)
    expect(Object.isFrozen(view.entities)).toBe(true)
    expect(Object.isFrozen(view.entities[0])).toBe(true)
    expect(Object.isFrozen(view.entities[0]!.position)).toBe(true)
    expect(Object.isFrozen(entity)).toBe(true)
    expect(Object.isFrozen(entity.data)).toBe(true)
    expect(Object.isFrozen(map)).toBe(true)
    expect(Object.isFrozen(commandLog)).toBe(true)
    expect(Object.isFrozen(commandLog[commandLog.length - 1])).toBe(true)
    expect(Object.isFrozen(commandLog[commandLog.length - 1]!.command)).toBe(true)
    candidate.abort()
  })
})
