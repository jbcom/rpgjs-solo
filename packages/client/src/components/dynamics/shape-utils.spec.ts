import { describe, expect, test } from "vitest";
import { getShapeBox, getShapePointBounds, translatePolygonPoints } from "./shape-utils";

describe("shape utilities", () => {
  test("normalizes rectangles and circles around their rendered bounds", () => {
    expect(getShapeBox({ type: "rect", width: 32, height: 32 })).toEqual({
      width: 32,
      height: 32,
      offsetX: 0,
      offsetY: 0
    });
    expect(getShapeBox({ type: "circle", radius: 8 })).toEqual({
      width: 16,
      height: 16,
      offsetX: 0,
      offsetY: 0
    });
  });

  test("normalizes line bounds with negative coordinates", () => {
    expect(getShapeBox({ type: "line", x1: -4, y1: 6, x2: 12, y2: -2 })).toEqual({
      width: 16,
      height: 8,
      offsetX: 4,
      offsetY: 2
    });
  });

  test("normalizes polygon bounds and translated points", () => {
    const box = getShapeBox({ type: "polygon", points: [-5, 2, 15, 2, 5, 12] });

    expect(getShapePointBounds([-5, 2, 15, 2, 5, 12])).toEqual({
      minX: -5,
      minY: 2,
      maxX: 15,
      maxY: 12
    });
    expect(box).toEqual({
      width: 20,
      height: 10,
      offsetX: 5,
      offsetY: -2
    });
    expect(translatePolygonPoints([-5, 2, 15, 2, 5, 12], box)).toEqual([0, 0, 20, 0, 10, 10]);
  });
});
