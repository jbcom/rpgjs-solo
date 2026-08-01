import { describe, expect, it } from "vitest";
import { readTiledXmlResponse } from "./xml-response";

const context = {
  kind: "map" as const,
  id: "simplemap",
  url: "/map/simplemap.tmx",
};

describe("readTiledXmlResponse", () => {
  it("returns a successful XML document", async () => {
    const response = new Response("<?xml version=\"1.0\"?><map />", {
      headers: { "Content-Type": "application/xml" },
    });

    await expect(readTiledXmlResponse(response, context)).resolves.toContain("<map");
  });

  it("rejects an HTML content type with an actionable SPA fallback error", async () => {
    const response = new Response("<!DOCTYPE html><html><body>Game shell</body></html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

    await expect(readTiledXmlResponse(response, context)).rejects.toThrowError(
      /expected TMX\/TSX XML but received an SPA HTML fallback.*Content-Type: text\/html.*publicPath\/buildOutputPath/s,
    );
  });

  it("detects an HTML body even when the host omits or mislabels Content-Type", async () => {
    const response = new Response("\uFEFF  <html><body>Fallback</body></html>", {
      headers: { "Content-Type": "application/octet-stream" },
    });

    await expect(readTiledXmlResponse(response, context)).rejects.toThrowError(
      /SPA HTML fallback.*Content-Type: application\/octet-stream/s,
    );
  });

  it("reports non-success responses before reading XML", async () => {
    const response = new Response("Not Found", { status: 404, statusText: "Not Found" });

    await expect(readTiledXmlResponse(response, context)).rejects.toThrowError(
      "Unable to load Tiled map 'simplemap' from '/map/simplemap.tmx': 404 Not Found",
    );
  });
});
