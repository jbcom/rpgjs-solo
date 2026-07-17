import { describe, expect, it, vi } from "vitest";
import type { MapStreamChunk, MapStreamManifest } from "@rpgjs/common";
import { MapStreamClientController } from "./mapStreaming";

type State = { keys: Set<string> };

function manifest(revision: string): MapStreamManifest<Record<string, never>> {
  return {
    protocol: 1,
    mapId: "demo",
    revision,
    width: 200,
    height: 100,
    chunkWidth: 100,
    chunkHeight: 100,
    columns: 2,
    rows: 1,
    renderData: {},
  };
}

function chunk(key: string, x: number): MapStreamChunk<{ tile: number }> {
  return {
    key,
    x,
    y: 0,
    bounds: { x: x * 100, y: 0, width: 100, height: 100 },
    renderData: { tile: x + 1 },
    hitboxes: [{ id: `wall-${key}`, x: x * 100, y: 0, width: 10, height: 10 }],
  };
}

describe("MapStreamClientController", () => {
  it("keeps the active map attached when a new map revision arrives", () => {
    const controller = new MapStreamClientController<Record<string, never>, { tile: number }, State>({
      component: {},
      createState: () => ({ keys: new Set() }),
      applyChunk: (state, value) => state.keys.add(value.key),
      removeChunk: (state, key) => state.keys.delete(key),
      getData: (state) => [...state.keys],
    }, manifest("one"));
    controller.receive({
      mapId: "demo",
      revision: "one",
      manifest: manifest("one"),
      chunks: [chunk("0:0", 0)],
      removed: [],
    });

    let current = controller.toMapData();
    const data = Object.assign(() => current, {
      set: vi.fn((value) => { current = value; }),
    });
    const map = {
      data,
      replaceStreamedStaticHitboxes: vi.fn(),
      clearStreamedStaticHitboxes: vi.fn(),
    };
    controller.attach(map);

    controller.reset(manifest("two"));
    controller.receive({
      mapId: "demo",
      revision: "two",
      manifest: manifest("two"),
      chunks: [chunk("1:0", 1)],
      removed: [],
    });

    expect(map.clearStreamedStaticHitboxes).toHaveBeenCalledWith("0:0");
    expect(map.replaceStreamedStaticHitboxes).toHaveBeenCalledWith("1:0", chunk("1:0", 1).hitboxes);
    expect(current.data).toEqual(["1:0"]);
  });
});
