import type { SaveSlot, SaveSlotEntries, SaveSlotList, SaveSlotMeta } from "@rpgjs/common";
import type { SaveStorageStrategy } from "../services/save";
import { RpgPlayer } from "../Player/Player";

export interface LocalStorageSaveStorageOptions {
  key?: string;
}

/**
 * Save storage strategy backed by browser localStorage.
 *
 * Intended for standalone mode where the server runs in the browser
 * and localStorage is available.
 */
export class LocalStorageSaveStorageStrategy implements SaveStorageStrategy {
  private key: string;

  constructor(options: LocalStorageSaveStorageOptions = {}) {
    this.key = options.key ?? "rpgjs-save-slots";
  }

  async list(_player: RpgPlayer): Promise<SaveSlotList> {
    return this.stripSnapshots(this.readSlots());
  }

  async get(_player: RpgPlayer, index: number): Promise<SaveSlot | null> {
    const slots = this.readSlots();
    return slots[index] ?? null;
  }

  async save(_player: RpgPlayer, index: number, snapshot: string, meta: SaveSlotMeta): Promise<void> {
    const slots = this.readSlots();
    const existing = slots[index];
    slots[index] = {
      ...(existing ?? {}),
      ...meta,
      snapshot,
    };
    this.writeSlots(slots);
  }

  async delete(_player: RpgPlayer, index: number): Promise<void> {
    const slots = this.readSlots();
    slots[index] = null;
    this.writeSlots(slots);
  }

  private readSlots(): SaveSlotEntries {
    if (typeof localStorage === "undefined") {
      return [];
    }
    const raw = localStorage.getItem(this.key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeSlots(slots: SaveSlotEntries) {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(this.key, JSON.stringify(slots));
  }

  private stripSnapshots(slots: SaveSlotEntries): SaveSlotList {
    return slots.map((slot) => {
      if (!slot) return null;
      const { snapshot, ...meta } = slot;
      return meta;
    });
  }
}
