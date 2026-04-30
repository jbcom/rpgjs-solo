import { describe, expect, test } from "vitest";
import { manhattanDistance, parseAoeMask } from "./targeting";

describe("targeting helpers", () => {
  test("parses an ASCII AoE mask around its center", () => {
    const mask = parseAoeMask([".#.", "###", ".#."]);

    expect(mask.width).toBe(3);
    expect(mask.height).toBe(3);
    expect(mask.cells).toEqual(
      expect.arrayContaining([
        { dx: 0, dy: -1 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 0, dy: 1 },
      ])
    );
  });

  test("uses Manhattan distance for tile targeting", () => {
    expect(manhattanDistance({ x: 2, y: 3 }, { x: 5, y: 1 })).toBe(5);
  });
});
