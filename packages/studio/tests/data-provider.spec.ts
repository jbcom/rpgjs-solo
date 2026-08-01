import { describe, expect, test, vi } from "vitest";
import { createCachedGameDataProvider } from "../src/data-provider/provider-factory";
import type { GameDataProvider } from "../src/data-provider/types";

describe("Studio game data provider", () => {
  test("deduplicates concurrent media requests", async () => {
    const source: GameDataProvider = {
      kind: "online",
      getProject: vi.fn(),
      getMap: vi.fn(),
      getDatabase: vi.fn(),
      getMedia: vi.fn(async (id: string) => ({ id })),
    };
    const provider = createCachedGameDataProvider(source);

    const first = provider.getMedia("media-1");
    const second = provider.getMedia("media-1");

    expect(first).toBe(second);
    await expect(first).resolves.toEqual({ id: "media-1" });
    expect(source.getMedia).toHaveBeenCalledTimes(1);
  });

  test("does not cache mutable block collections", async () => {
    let revision = 1;
    const source: GameDataProvider = {
      kind: "online",
      getProject: vi.fn(),
      getMap: vi.fn(),
      getDatabase: vi.fn(),
      getMedia: vi.fn(),
      getBlockCollection: vi.fn(async () => ({ revision: revision++ })),
    };
    const provider = createCachedGameDataProvider(source);

    await expect(provider.getBlockCollection?.("workflow")).resolves.toEqual({
      revision: 1,
    });
    await expect(provider.getBlockCollection?.("workflow")).resolves.toEqual({
      revision: 2,
    });
    expect(source.getBlockCollection).toHaveBeenCalledTimes(2);
  });
});
