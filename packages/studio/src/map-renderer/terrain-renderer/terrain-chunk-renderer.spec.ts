import { describe, expect, it } from "vitest";
import { StudioTerrainChunkRenderer } from "./terrain-chunk-renderer";

describe("StudioTerrainChunkRenderer terrain control cache", () => {
  it("does not reuse a buffer when region content changes after the base64 prefix", () => {
    const renderer = new StudioTerrainChunkRenderer({ sortableChildren: false } as any);
    const getBuffer = (control: any) =>
      (renderer as any).getTerrainControlBuffer(control, null);
    const baseRegion = {
      key: "0:0",
      x: 0,
      y: 0,
      width: 3,
      height: 1,
      encoding: "rgba8-base64",
    };
    const first = getBuffer({
      source: "",
      width: 3,
      height: 1,
      regions: [{ ...baseRegion, data: "AQIDBAUGBwgJCgsM" }],
    });
    const second = getBuffer({
      source: "",
      width: 3,
      height: 1,
      regions: [{ ...baseRegion, data: "AQIDBAUGBwgJCgAA" }],
    });

    expect(second).not.toBe(first);
    expect(Array.from(second.data)).not.toEqual(Array.from(first.data));
  });
});
