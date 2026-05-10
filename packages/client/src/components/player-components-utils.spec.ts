import { describe, expect, test } from "vitest";
import {
  computeBlockPosition,
  computeBlockSize,
  estimateComponentSize,
  getComponentProps
} from "./player-components-utils";

const graphic = {
  left: -8,
  top: -24,
  right: 40,
  bottom: 48,
  width: 48,
  height: 72,
  centerX: 16,
  centerY: 12
};

describe("player component layout utilities", () => {
  test("bottom layout uses the hitbox as positioning rectangle", () => {
    const rowMetrics = [
      {
        cells: [{ width: 32, height: 32 }],
        width: 32,
        height: 32
      }
    ];

    const size = computeBlockSize({
      position: "bottom",
      rowMetrics,
      graphic,
      hitbox: { w: 32, h: 32 }
    });

    expect(size).toEqual({ width: 32, height: 32 });
    expect(
      computeBlockPosition({
        position: "bottom",
        size,
        graphic,
        hitbox: { w: 32, h: 32 }
      })
    ).toEqual({ x: 0, y: 0 });
  });

  test("bottom layout centers smaller content in the hitbox rectangle", () => {
    const size = computeBlockSize({
      position: "bottom",
      rowMetrics: [
        {
          cells: [{ width: 16, height: 8 }],
          width: 16,
          height: 8
        }
      ],
      graphic,
      hitbox: { w: 32, h: 32 }
    });

    expect(size).toEqual({ width: 32, height: 32 });
    expect(
      computeBlockPosition({
        position: "bottom",
        size,
        graphic,
        hitbox: { w: 32, h: 32 }
      })
    ).toEqual({ x: 0, y: 0 });
  });

  test("bottom margins move from the hitbox-centered position", () => {
    const position = computeBlockPosition({
      position: "bottom",
      size: { width: 32, height: 32 },
      layout: { marginLeft: 3, marginRight: 1, marginBottom: 16, marginTop: 4 },
      graphic,
      hitbox: { w: 32, h: 32 }
    });

    expect(position).toEqual({ x: 2, y: 12 });
  });

  test("top layout remains anchored above graphic bounds", () => {
    const position = computeBlockPosition({
      position: "top",
      size: { width: 50, height: 12 },
      graphic,
      hitbox: { w: 32, h: 32 }
    });

    expect(position).toEqual({ x: -9, y: -36 });
  });

  test("estimates bar labels, shape aliases, circles, lines and polygons", () => {
    expect(estimateComponentSize({ type: "hpBar", style: { width: 60, height: 6 }, text: "{$percent}%" })).toEqual({ width: 60, height: 18 });
    expect(estimateComponentSize({ type: "shape", value: { type: "rect", width: 32, height: 24 } })).toEqual({ width: 32, height: 24 });
    expect(estimateComponentSize({ type: "shape", value: { type: "circle", radius: 7 } })).toEqual({ width: 14, height: 14 });
    expect(estimateComponentSize({ type: "shape", value: { type: "line", x1: -4, y1: 2, x2: 6, y2: 2 } })).toEqual({ width: 10, height: 1 });
    expect(estimateComponentSize({ type: "shape", value: { type: "polygon", points: [-5, 2, 15, 2, 5, 12] } })).toEqual({ width: 20, height: 10 });
  });

  test("legacy hp and sp bars receive default fill colors", () => {
    expect(getComponentProps({ type: "hpBar" }).style.fillColor).toBe("#ef4444");
    expect(getComponentProps({ type: "spBar" }).style.fillColor).toBe("#3b82f6");
    expect(getComponentProps({ type: "hpBar", style: { fillColor: "#111111" } }).style.fillColor).toBe("#111111");
  });
});
