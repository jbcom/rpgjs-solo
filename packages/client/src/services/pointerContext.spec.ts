import { describe, expect, test } from "vitest";
import { createClientPointerContext } from "./pointerContext";

describe("createClientPointerContext", () => {
  test("returns null before any pointer event", () => {
    const pointer = createClientPointerContext();

    expect(pointer.screen()).toBeNull();
    expect(pointer.world()).toBeNull();
  });

  test("stores screen and world coordinates from pointer events", () => {
    const pointer = createClientPointerContext();

    const world = pointer.updateFromEvent({
      global: { x: 120, y: 80 },
      currentTarget: {
        toLocal(point: { x: number; y: number }) {
          return { x: point.x + 10, y: point.y + 20 };
        },
      },
    });

    expect(world).toEqual({ x: 130, y: 100 });
    expect(pointer.screen()).toEqual({ x: 120, y: 80 });
    expect(pointer.world()).toEqual({ x: 130, y: 100 });
  });

  test("ignores pointer events without usable coordinates", () => {
    const pointer = createClientPointerContext();

    expect(pointer.updateFromEvent({ global: { x: Number.NaN, y: 80 } })).toBeNull();
    expect(pointer.screen()).toBeNull();
    expect(pointer.world()).toBeNull();
  });
});
