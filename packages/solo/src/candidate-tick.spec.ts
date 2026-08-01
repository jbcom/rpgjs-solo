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
      expect(runtime.getEntity('hero')).toBe(hero)
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
    expect(runtime.getEntity('hero')).toBe(hero)
    expect(hero.stats.hp).toBe(88)
    expect(publication.state).toEqual({ records: ['hero:12'] })
    expect(Object.isFrozen(publication)).toBe(true)
    expect(Object.isFrozen(publication.state)).toBe(true)
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
})
