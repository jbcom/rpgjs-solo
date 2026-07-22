import type { SoloRuntimeSnapshot } from './types'
import type { SoloRuntime } from './runtime'

export interface SoloSaveStore {
  get(slot: string): Promise<SoloRuntimeSnapshot | null>
  set(slot: string, snapshot: SoloRuntimeSnapshot): Promise<void>
  delete(slot: string): Promise<void>
  list(): Promise<string[]>
}

/** Deterministic in-memory store for tests, replays, and ephemeral sessions. */
export class MemorySoloSaveStore implements SoloSaveStore {
  private readonly values = new Map<string, SoloRuntimeSnapshot>()

  async get(slot: string): Promise<SoloRuntimeSnapshot | null> {
    const value = this.values.get(slot)
    return value ? structuredClone(value) : null
  }

  async set(slot: string, snapshot: SoloRuntimeSnapshot): Promise<void> {
    this.values.set(slot, structuredClone(snapshot))
  }

  async delete(slot: string): Promise<void> {
    this.values.delete(slot)
  }

  async list(): Promise<string[]> {
    return [...this.values.keys()].sort()
  }
}

export interface SoloStringStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

/** Browser/local adapter that keeps persistence outside runtime authority. */
export class WebStorageSoloSaveStore implements SoloSaveStore {
  constructor(
    private readonly storage: SoloStringStorage,
    private readonly prefix = 'rpgjs-solo:'
  ) {}

  async get(slot: string): Promise<SoloRuntimeSnapshot | null> {
    const value = this.storage.getItem(this.keyFor(slot))
    return value === null ? null : (JSON.parse(value) as SoloRuntimeSnapshot)
  }

  async set(slot: string, snapshot: SoloRuntimeSnapshot): Promise<void> {
    this.storage.setItem(this.keyFor(slot), JSON.stringify(snapshot))
  }

  async delete(slot: string): Promise<void> {
    this.storage.removeItem(this.keyFor(slot))
  }

  async list(): Promise<string[]> {
    const slots: string[] = []
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index)
      if (key?.startsWith(this.prefix)) slots.push(key.slice(this.prefix.length))
    }
    return slots.sort()
  }

  private keyFor(slot: string): string {
    if (slot.length === 0) throw new Error('Save slot must not be empty')
    return `${this.prefix}${slot}`
  }
}

export const saveSoloRuntime = async (runtime: SoloRuntime, store: SoloSaveStore, slot: string): Promise<void> => {
  await store.set(slot, runtime.createSnapshot())
}

export const loadSoloRuntime = async (runtime: SoloRuntime, store: SoloSaveStore, slot: string): Promise<boolean> => {
  const snapshot = await store.get(slot)
  if (!snapshot) return false
  runtime.restoreSnapshot(snapshot)
  return true
}
