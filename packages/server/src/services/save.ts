import { SaveSlot, SaveSlotEntries, SaveSlotList, SaveSlotMeta } from "@rpgjs/common";
import { inject } from "../core/inject";
import { RpgPlayer } from "../Player/Player";

export const SaveStorageToken = "SaveStorageToken";

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

export function resolveSaveStorageStrategy(): SaveStorageStrategy {
  if (cachedSaveStorage) return cachedSaveStorage;
  try {
    cachedSaveStorage = inject<SaveStorageStrategy>(SaveStorageToken);
  } catch {
    cachedSaveStorage = new InMemorySaveStorageStrategy();
  }
  return cachedSaveStorage;
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
