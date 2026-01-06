import { SaveSlot, SaveSlotEntries, SaveSlotList, SaveSlotMeta } from "@rpgjs/common";
import { inject } from "../core/inject";
import { RpgPlayer } from "../Player/Player";

export const SaveStorageToken = "SaveStorageToken";

export type SaveSlotIndex = number | "auto";

export interface SaveRequestContext {
  reason?: "manual" | "auto" | "load";
  source?: string;
}

export interface AutoSaveStrategy {
  canSave?: (player: RpgPlayer, context?: SaveRequestContext) => boolean;
  canLoad?: (player: RpgPlayer, context?: SaveRequestContext) => boolean;
  shouldAutoSave?: (player: RpgPlayer, context?: SaveRequestContext) => boolean;
  getDefaultSlot?: (player: RpgPlayer, context?: SaveRequestContext) => number | null;
}

export interface SaveStorageStrategy {
  list(player: RpgPlayer): Promise<SaveSlotList>;
  get(player: RpgPlayer, index: number): Promise<SaveSlot | null>;
  save(player: RpgPlayer, index: number, snapshot: string, meta: SaveSlotMeta): Promise<void>;
  delete?(player: RpgPlayer, index: number): Promise<void>;
}

type PlayerSlots = Map<string, SaveSlotEntries>;

export class InMemorySaveStorageStrategy implements SaveStorageStrategy {
  private slotsByPlayer: PlayerSlots = new Map();

  async list(player: RpgPlayer): Promise<SaveSlotList> {
    return this.stripSnapshots(this.getSlots(player));
  }

  async get(player: RpgPlayer, index: number): Promise<SaveSlot | null> {
    const slots = this.getSlots(player);
    const slot = slots[index];
    return slot ?? null;
  }

  async save(player: RpgPlayer, index: number, snapshot: string, meta: SaveSlotMeta): Promise<void> {
    const slots = this.getSlots(player);
    const existing = slots[index];
    slots[index] = {
      ...(existing ?? {}),
      ...meta,
      snapshot,
    };
  }

  async delete(player: RpgPlayer, index: number): Promise<void> {
    const slots = this.getSlots(player);
    slots[index] = null;
  }

  private getSlots(player: RpgPlayer): SaveSlotEntries {
    const key = player.id ?? "unknown";
    if (!this.slotsByPlayer.has(key)) {
      this.slotsByPlayer.set(key, []);
    }
    return this.slotsByPlayer.get(key)!;
  }

  private stripSnapshots(slots: SaveSlotEntries): SaveSlotList {
    return slots.map((slot) => {
      if (!slot) return null;
      const { snapshot, ...meta } = slot;
      return meta;
    });
  }
}

let cachedSaveStorage: SaveStorageStrategy | null = null;
let cachedAutoSave: AutoSaveStrategy | null = null;

export const AutoSaveToken = "AutoSaveToken";

export function resolveSaveStorageStrategy(): SaveStorageStrategy {
  if (cachedSaveStorage) return cachedSaveStorage;
  try {
    cachedSaveStorage = inject<SaveStorageStrategy>(SaveStorageToken);
  } catch {
    cachedSaveStorage = new InMemorySaveStorageStrategy();
  }
  return cachedSaveStorage;
}

export function resolveAutoSaveStrategy(): AutoSaveStrategy {
  if (cachedAutoSave) return cachedAutoSave;
  try {
    cachedAutoSave = inject<AutoSaveStrategy>(AutoSaveToken);
  } catch {
    cachedAutoSave = null;
  }
  cachedAutoSave ||= {
    canSave: () => true,
    canLoad: () => true,
    shouldAutoSave: () => false,
    getDefaultSlot: () => 0,
  };
  return cachedAutoSave;
}

export function resolveSaveSlot(
  slot: SaveSlotIndex | undefined,
  policy: AutoSaveStrategy,
  player: RpgPlayer,
  context?: SaveRequestContext
): number | null {
  if (typeof slot === "number") return slot;
  const resolver = policy.getDefaultSlot;
  if (!resolver) return null;
  return resolver(player, context);
}

export function shouldAutoSave(player: RpgPlayer, context?: SaveRequestContext): boolean {
  const strategy = resolveAutoSaveStrategy();
  if (!strategy.shouldAutoSave) return false;
  return strategy.shouldAutoSave(player, context);
}

export function buildSaveSlotMeta(player: RpgPlayer, overrides: SaveSlotMeta = {}): SaveSlotMeta {
  const mapId = player.getCurrentMap()?.id;
  const base: SaveSlotMeta = {
    level: typeof player.level === "number" ? player.level : undefined,
    exp: typeof player.exp === "number" ? player.exp : undefined,
    map: typeof mapId === "string" ? mapId : undefined,
    date: new Date().toISOString(),
  };
  return { ...base, ...overrides };
}

export function provideSaveStorage(strategy: SaveStorageStrategy) {
  return {
    provide: SaveStorageToken,
    useValue: strategy,
  };
}

export function provideAutoSave(strategy: AutoSaveStrategy) {
  return {
    provide: AutoSaveToken,
    useValue: strategy,
  };
}
