import { describe, expect, it, vi } from "vitest";
import { rpgjs } from "../src/rpgjs-plugin";

vi.mock("../src/server-plugin", () => ({
  serverPlugin: () => ({ name: "rpgjs:server" }),
}));

describe("rpgjs plugin", () => {
  it("excludes RPGJS and CanvasEngine runtimes from Vite dependency optimization", () => {
    const plugins = rpgjs({ server: {} });
    const runtimePlugin = plugins.find((plugin: any) => plugin.name === "rpgjs:runtime-dedupe") as any;
    const config = runtimePlugin.config();

    expect(config.resolve.dedupe).toEqual([
      "@canvasengine/presets",
      "canvasengine",
      "pixi.js",
    ]);
    expect(config.optimizeDeps.exclude).toEqual([
      "@canvasengine/presets",
      "canvasengine",
      "pixi.js",
      "@rpgjs/client",
      "@rpgjs/common",
      "@rpgjs/server",
      "@rpgjs/tiledmap/client",
      "@rpgjs/tiledmap/server",
    ]);
    expect(config.optimizeDeps.include).toContain("pixi.js > eventemitter3");
  });
});
