import { describe, expect, it, vi } from "vitest";
import createStudioServer from "./server";

interface LegacyMapPayload {
  id: string;
  config: Record<string, unknown>;
  events: unknown[];
  commonEvents: unknown[];
  data: {
    creationDetails: { version: string };
    params: {
      scale: number;
      weather?: unknown;
    };
    weather?: unknown;
    events: unknown[];
    commonEvents: unknown[];
  };
}

function createLegacyMapPayload(): LegacyMapPayload {
  return {
    id: "legacy-map",
    config: {},
    events: [],
    commonEvents: [],
    data: {
      creationDetails: { version: "v1" },
      params: { scale: 1 },
      events: [],
      commonEvents: [],
    },
  };
}

describe("Studio server map streaming configuration", () => {
  it("uses the injected provider for direct-load event media", async () => {
    const getMedia = vi.fn(async (mediaId: string) => ({
      _id: mediaId,
      url: `https://private.example/${mediaId}.png`,
    }));
    const module = createStudioServer({
      runtimeMode: "online",
      streaming: false,
      dataProvider: {
        kind: "online",
        getProject: vi.fn(),
        getMap: vi.fn(),
        getMedia,
        getDatabase: vi.fn(),
      },
    });
    const payload = {
      id: "trusted-map",
      config: {},
      events: [{
        id: "event-1",
        params: { graphic: { _id: "#event-media" } },
      }],
      commonEvents: [{
        id: "common-event-1",
        triggers: [{ graphic: { mediaId: "common-media" } }],
      }],
      data: {
        creationDetails: { version: "v2" },
        params: { scale: 1 },
        events: [],
        commonEvents: [],
      },
    };

    await module.map?.onBeforeUpdate?.(payload, {} as any);

    expect(getMedia.mock.calls.map(([mediaId]) => mediaId)).toEqual([
      "event-media",
      "common-media",
    ]);
    expect(payload.events[0].params.graphic).toEqual(expect.objectContaining({
      _id: "event-media",
      url: "https://private.example/event-media.png",
    }));
    expect(payload.commonEvents[0].triggers[0].graphic).toEqual(expect.objectContaining({
      _id: "common-media",
      url: "https://private.example/common-media.png",
    }));
  });

  it("leaves custom map payloads untouched when built-in streaming is disabled", async () => {
    const module = createStudioServer({ streaming: false });
    const payload = createLegacyMapPayload();

    await expect(module.map?.onBeforeUpdate?.(payload, {} as any)).resolves.toBeDefined();
    expect(payload.data.creationDetails.version).toBe("v1");
  });

  it("still requires Studio v2 payloads when built-in streaming is enabled", async () => {
    const module = createStudioServer({ streaming: {} });

    await expect(
      module.map?.onBeforeUpdate?.(createLegacyMapPayload(), {} as any)
    ).rejects.toThrow(/must use format v2/);
  });

  it("initializes map weather stored in Studio params", async () => {
    const module = createStudioServer({ streaming: false });
    const payload = createLegacyMapPayload();
    const weather = {
      effect: "cloud",
      preset: "sunnySoftRays",
      params: {
        density: 0.62,
        sunIntensity: 1.05,
      },
    };
    payload.data.params.weather = weather;
    const map = {
      setWeather: vi.fn(),
    };

    await module.map?.onBeforeUpdate?.(payload, map as any);

    expect(payload.data.weather).toMatchObject({
      effect: "cloud",
      preset: "sunnySoftRays",
      params: {
        density: 0.62,
        sunIntensity: 1,
      },
    });
    expect(map.setWeather).toHaveBeenCalledWith(payload.data.weather);
  });
});
