import { describe, expect, it } from "vitest";
import createStudioServer from "./server";

function createLegacyMapPayload() {
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
});
