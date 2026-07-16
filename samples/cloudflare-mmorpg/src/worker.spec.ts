import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const mapPayload = {
  id: "demo",
  width: 320,
  height: 320,
  events: [],
};

describe("Cloudflare MMORPG map administration", () => {
  it("rejects an untrusted map update", async () => {
    const response = await SELF.fetch("https://example.test/parties/main/map-demo/map/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mapPayload),
    });
    expect(response.status).toBe(401);
  });

  it("accepts a trusted map update", async () => {
    const response = await SELF.fetch("https://example.test/parties/main/map-demo/map/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-rpgjs-map-update-token": "test-map-update-token",
      },
      body: JSON.stringify(mapPayload),
    });
    expect(response.ok).toBe(true);
  });
});
