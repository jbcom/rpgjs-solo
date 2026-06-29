import { describe, expect, test } from "vitest";
import {
  resolveHitboxAnchor,
  resolveScaledHitboxAnchor,
  scaleHitboxForGraphicDisplay,
} from "./character-hitbox";

describe("character hitbox display helpers", () => {
  test("keeps the rendered hitbox dimensions stable when graphic display scale changes", () => {
    const hitbox = { w: 32, h: 32 };
    const scaled = scaleHitboxForGraphicDisplay(hitbox, [0.5, 0.5]);

    expect(scaled).toEqual({ w: 64, h: 64 });
    expect(scaled!.w * 0.5).toBe(32);
    expect(scaled!.h * 0.5).toBe(32);
  });

  test("anchors the graphic from the display-adjusted hitbox", () => {
    const unscaledAnchor = resolveHitboxAnchor(96, 96, undefined, { w: 32, h: 32 });
    const scaledAnchor = resolveHitboxAnchor(96, 96, undefined, { w: 64, h: 64 });

    expect(unscaledAnchor).toEqual([1 / 3, 2 / 3]);
    expect(scaledAnchor).toEqual([1 / 6, 1 / 3]);
  });

  test("keeps the graphic foot aligned with the hitbox foot after sprite scale", () => {
    const anchor = resolveScaledHitboxAnchor(256, 256, undefined, { w: 56, h: 50 }, [0.5, 0.5]);

    const renderedBottom = (1 - anchor[1]) * 256 * 0.5;

    expect(renderedBottom).toBe(50);
  });
});
