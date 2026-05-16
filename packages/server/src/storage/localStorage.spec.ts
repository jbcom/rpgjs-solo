import { beforeEach, describe, expect, test } from "vitest";
import { LocalStorageSaveStorageStrategy } from "./localStorage";

describe("LocalStorageSaveStorageStrategy", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("saves, lists and reads slots with snapshots kept out of the list", async () => {
    const storage = new LocalStorageSaveStorageStrategy({ key: "test-slots" });
    const player = {} as any;

    await storage.save(player, 1, "snapshot-a", {
      id: "slot-a",
      date: 123,
      map: "forest",
    } as any);

    expect(await storage.list(player)).toEqual([
      null,
      { id: "slot-a", date: 123, map: "forest" },
    ]);
    expect(await storage.get(player, 1)).toEqual({
      id: "slot-a",
      date: 123,
      map: "forest",
      snapshot: "snapshot-a",
    });
  });

  test("overwrites existing slots while preserving custom metadata shape", async () => {
    const storage = new LocalStorageSaveStorageStrategy({ key: "test-slots" });
    const player = {} as any;

    await storage.save(player, 0, "snapshot-a", {
      id: "slot-a",
      chapter: 1,
    } as any);
    await storage.save(player, 0, "snapshot-b", {
      id: "slot-b",
      chapter: 2,
    } as any);

    expect(await storage.get(player, 0)).toEqual({
      id: "slot-b",
      chapter: 2,
      snapshot: "snapshot-b",
    });
  });

  test("deletes slots and ignores corrupted localStorage data", async () => {
    const storage = new LocalStorageSaveStorageStrategy({ key: "test-slots" });
    const player = {} as any;

    await storage.save(player, 0, "snapshot-a", { id: "slot-a" } as any);
    await storage.delete(player, 0);

    expect(await storage.list(player)).toEqual([null]);
    expect(await storage.get(player, 0)).toBeNull();

    localStorage.setItem("test-slots", "{broken");
    expect(await storage.list(player)).toEqual([]);
    expect(await storage.get(player, 0)).toBeNull();
  });
});
