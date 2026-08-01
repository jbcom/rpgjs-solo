import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createCachedGameDataProvider,
  createGameDataProvider,
} from "../src/data-provider/provider-factory";
import type { GameDataProvider } from "../src/data-provider/types";

describe("Studio game data provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

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

  test("authenticates protected online block reads without authenticating public game reads", async () => {
    vi.stubEnv("RPGSTUDIO_API_KEY", " studio-secret ");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ blocks: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = createGameDataProvider("online", {
      apiBaseUrl: "https://studio.example/api",
      bundleBasePath: "/game-data",
    });

    await provider.getBlockCollection?.("quest/intro");
    await provider.getMap("map-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://studio.example/api/blocks/quest%2Fintro",
      { headers: { "x-api-key": "studio-secret" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://studio.example/api/game/maps/map-1",
      undefined,
    );
  });

  test("omits the protected header when no Studio API key is configured", async () => {
    vi.stubEnv("RPGSTUDIO_API_KEY", "");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ blocks: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = createGameDataProvider("online", {
      apiBaseUrl: "https://studio.example/api",
      bundleBasePath: "/game-data",
    });

    await provider.getBlockCollection?.("workflow");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://studio.example/api/blocks/workflow",
      undefined,
    );
  });

  test("reports protected endpoint authorization failures without leaking credentials", async () => {
    vi.stubEnv("RPGSTUDIO_API_KEY", "never-print-this");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    const provider = createGameDataProvider("online", {
      apiBaseUrl: "https://studio.example/api",
      bundleBasePath: "/game-data",
    });

    const request = provider.getBlockCollection?.("workflow");
    await expect(request).rejects.toThrow(
      "[HttpGameDataProvider] block collection query authentication failed (401)",
    );
    await expect(request).rejects.not.toThrow("never-print-this");
  });

  test("keeps offline block reads local and auto mode local-first", async () => {
    vi.stubEnv("RPGSTUDIO_API_KEY", "online-only");
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify({ source: String(url).startsWith("/bundle") ? "local" : "online", blocks: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const config = {
      apiBaseUrl: "https://studio.example/api",
      bundleBasePath: "/bundle",
    };

    await expect(
      createGameDataProvider("offline", config).getBlockCollection?.("workflow"),
    ).resolves.toMatchObject({ source: "local" });
    await expect(
      createGameDataProvider("auto", config).getBlockCollection?.("workflow"),
    ).resolves.toMatchObject({ source: "local" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/bundle/blocks/workflow.json");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/bundle/blocks/workflow.json");
  });

  test("auto mode authenticates only after a failed local block read", async () => {
    vi.stubEnv("RPGSTUDIO_API_KEY", "fallback-secret");
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).startsWith("/bundle")) {
        return new Response(null, { status: 404 });
      }
      return new Response(JSON.stringify({ source: "online", blocks: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createGameDataProvider("auto", {
      apiBaseUrl: "https://studio.example/api",
      bundleBasePath: "/bundle",
    });

    await expect(provider.getBlockCollection?.("workflow")).resolves.toMatchObject({
      source: "online",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/bundle/blocks/workflow.json");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://studio.example/api/blocks/workflow",
      { headers: { "x-api-key": "fallback-secret" } },
    );
  });
});
