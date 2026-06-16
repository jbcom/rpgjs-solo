import { describe, expect, it } from "vitest";
import {
  collectStudioMapPluginPixiChildren,
  composeStudioMapPluginOptions,
  createStudioMapPlugins,
  resolveStudioEventCollisionDebugRects,
  studioDebugCollisionsPlugin,
  type StudioMapPlugin,
} from "./studio-map-plugins";

const createContext = () => ({
  engine: {} as any,
  map: { id: "map" },
  data: { id: "map" },
});

describe("studio map plugins", () => {
  it("does not install plugins by default", () => {
    expect(createStudioMapPlugins()).toEqual([]);
  });

  it("installs the debug collisions plugin from the compatibility shortcut", () => {
    const plugins = createStudioMapPlugins({ debugCollisions: true });

    expect(plugins).toHaveLength(1);
    expect(plugins[0].id).toBe("studio.debug-collisions");
    expect(plugins[0].terrainOptions?.(createContext()).debugCollisions).toBe(true);
    expect(plugins[0].elementRenderOptions?.(createContext()).debugCollisions).toBe(true);
  });

  it("preserves explicit plugins and lets them override shortcut options", () => {
    const overridePlugin: StudioMapPlugin = {
      id: "override",
      terrainOptions: () => ({ debugCollisions: false }),
      elementRenderOptions: () => ({ debugCollisions: false }),
    };
    const plugins = createStudioMapPlugins({
      plugins: [overridePlugin],
      debugCollisions: true,
    });

    expect(plugins.map((plugin) => plugin.id)).toEqual(["studio.debug-collisions", "override"]);
    expect(composeStudioMapPluginOptions(plugins, "terrainOptions", createContext())).toEqual({
      debugCollisions: false,
    });
    expect(composeStudioMapPluginOptions(plugins, "elementRenderOptions", createContext())).toEqual({
      debugCollisions: false,
    });
  });

  it("does not duplicate an explicit debug collisions plugin", () => {
    const debugPlugin = studioDebugCollisionsPlugin({ events: false });
    const plugins = createStudioMapPlugins({
      plugins: [debugPlugin],
      debugCollisions: true,
    });

    expect(plugins).toEqual([debugPlugin]);
  });

  it("collects plugin pixi children in plugin order", () => {
    const first = { label: "first" };
    const second = { label: "second" };
    const plugins: StudioMapPlugin[] = [
      { id: "first", eventLayerPixiChildren: () => [first] },
      { id: "second", eventLayerPixiChildren: () => [second] },
    ];

    expect(collectStudioMapPluginPixiChildren(plugins, createContext())).toEqual([first, second]);
  });

  it("resolves event debug rectangles from the physics body top-left position", () => {
    const engine = {
      sceneMap: {
        events: {
          npc: {
            hitbox: () => ({ w: 18, h: 26 }),
            x: () => 10,
            y: () => 20,
          },
        },
        getBodyPosition: (id: string, mode: string) => {
          expect(id).toBe("npc");
          expect(mode).toBe("top-left");
          return { x: 42.4, y: 64.6 };
        },
      },
    } as any;

    expect(resolveStudioEventCollisionDebugRects(engine)).toEqual([
      {
        id: "npc",
        x: 42,
        y: 65,
        width: 18,
        height: 26,
      },
    ]);
  });

  it("falls back to event coordinates when the physics body is unavailable", () => {
    const engine = {
      sceneMap: {
        events: {
          npc: {
            hitbox: { w: 16, h: 24 },
            x: () => 32,
            y: () => 48,
          },
        },
        getBodyPosition: () => undefined,
      },
    } as any;

    expect(resolveStudioEventCollisionDebugRects(engine)).toEqual([
      {
        id: "npc",
        x: 32,
        y: 48,
        width: 16,
        height: 24,
      },
    ]);
  });

  it("ignores events with invalid hitboxes", () => {
    const engine = {
      sceneMap: {
        events: {
          missing: { x: 0, y: 0 },
          empty: { hitbox: () => ({ w: 0, h: 24 }), x: 0, y: 0 },
          invalid: { hitbox: () => ({ w: Number.NaN, h: 24 }), x: 0, y: 0 },
        },
      },
    } as any;

    expect(resolveStudioEventCollisionDebugRects(engine)).toEqual([]);
  });

  it("includes player hitboxes by default and allows disabling them", () => {
    const engine = {
      sceneMap: {
        events: {
          npc: { hitbox: () => ({ w: 16, h: 24 }), x: 10, y: 20 },
        },
        players: {
          hero: { hitbox: () => ({ w: 20, h: 28 }), x: 30, y: 40 },
        },
      },
    } as any;

    expect(resolveStudioEventCollisionDebugRects(engine).map((rect) => rect.id)).toEqual([
      "npc",
      "hero",
    ]);
    expect(resolveStudioEventCollisionDebugRects(engine, { players: false }).map((rect) => rect.id)).toEqual(["npc"]);
  });
});
