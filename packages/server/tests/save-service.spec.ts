import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  AutoSaveToken,
  InMemorySaveStorageStrategy,
  SaveStorageToken,
  buildSaveSlotMeta,
  provideAutoSave,
  provideSaveStorage,
  resolveSaveSlot,
} from "../src/services/save";

describe("save services", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("stores slots per player and strips snapshots from list results", async () => {
    const storage = new InMemorySaveStorageStrategy();
    const playerA = { id: "player-a" } as any;
    const playerB = { id: "player-b" } as any;

    await storage.save(playerA, 0, "snapshot-a", {
      id: "slot-a",
      map: "forest",
    } as any);
    await storage.save(playerB, 0, "snapshot-b", {
      id: "slot-b",
      map: "town",
    } as any);

    expect(await storage.list(playerA)).toEqual([{ id: "slot-a", map: "forest" }]);
    expect(await storage.get(playerA, 0)).toEqual({
      id: "slot-a",
      map: "forest",
      snapshot: "snapshot-a",
    });
    expect(await storage.get(playerB, 0)).toEqual({
      id: "slot-b",
      map: "town",
      snapshot: "snapshot-b",
    });
  });

  test("overwrites existing slots and can delete them", async () => {
    const storage = new InMemorySaveStorageStrategy();
    const player = { id: "player-a" } as any;

    await storage.save(player, 1, "snapshot-a", {
      id: "slot-a",
      chapter: 1,
    } as any);
    await storage.save(player, 1, "snapshot-b", {
      chapter: 2,
    } as any);

    expect(await storage.get(player, 1)).toEqual({
      id: "slot-a",
      chapter: 2,
      snapshot: "snapshot-b",
    });

    await storage.delete(player, 1);

    expect(await storage.list(player)).toEqual([undefined, null]);
    expect(await storage.get(player, 1)).toBeNull();
  });

  test("resolves explicit and auto save slots", () => {
    const player = { id: "player-a" } as any;
    const context = { reason: "auto", source: "syncChanges" } as const;
    const policy = {
      getDefaultSlot: vi.fn(() => 3),
    };

    expect(resolveSaveSlot(2, policy, player, context)).toBe(2);
    expect(resolveSaveSlot("auto", policy, player, context)).toBe(3);
    expect(resolveSaveSlot(undefined, {}, player, context)).toBeNull();
    expect(policy.getDefaultSlot).toHaveBeenCalledWith(player, context);
  });

  test("builds save metadata from player state with override priority", () => {
    const player = {
      level: 5,
      exp: 120,
      getCurrentMap: () => ({ id: "forest" }),
    } as any;

    expect(buildSaveSlotMeta(player, { map: "override", custom: "value" } as any)).toEqual({
      level: 5,
      exp: 120,
      map: "override",
      date: "2026-01-02T03:04:05.000Z",
      custom: "value",
    });
  });

  test("creates DI providers for save and auto-save strategies", () => {
    const storage = new InMemorySaveStorageStrategy();
    const autoSave = { shouldAutoSave: () => true };

    expect(provideSaveStorage(storage)).toEqual({
      provide: SaveStorageToken,
      useValue: storage,
    });
    expect(provideAutoSave(autoSave)).toEqual({
      provide: AutoSaveToken,
      useValue: autoSave,
    });
  });
});
