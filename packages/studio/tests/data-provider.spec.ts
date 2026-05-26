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
});
