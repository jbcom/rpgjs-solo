import { describe, expect, test, vi } from "vitest";
import { signal } from "canvasengine";
import { appendFramePayload, RpgClientObject, withGraphicDisplayScale } from "./Object";

vi.mock("../RpgClientEngine", () => ({
  RpgClientEngine: class RpgClientEngine {},
}));

vi.mock("../core/inject", () => ({
  inject: () => ({}),
}));

function createObject() {
  const object = Object.create(RpgClientObject.prototype) as RpgClientObject;
  object.animationName = signal("stand");
  object.graphics = signal(["hero"]) as any;
  object.animationCurrentIndex = signal(0);
  object.animationIsPlaying = signal(false);
  return object;
}

describe("RpgClientObject animations", () => {
  test("accepts a single frame payload without requiring iterable spread", () => {
    expect(
      appendFramePayload({ stale: true }, { x: 10, y: 20, ts: 1 }),
    ).toEqual([{ x: 10, y: 20, ts: 1 }]);
  });

  test("keeps instance scale outside the spritesheet transform scale", () => {
    expect(withGraphicDisplayScale({ id: "hero" }, 0.5)).toEqual({
      id: "hero",
      displayScale: 0.5,
    });
  });

  test("marks temporary animation as finished before restoring locomotion animation", async () => {
    const object = createObject();
    const animationChanges: Array<{ name: string; isPlaying: boolean }> = [];

    object.animationName.observable.subscribe((name) => {
      animationChanges.push({
        name,
        isPlaying: object.animationIsPlaying(),
      });
    });

    const done = object.setAnimation("attack", 1, { timeoutMs: 10000 });
    object.animationCurrentIndex.set(1);

    await done;

    expect(object.animationName()).toBe("stand");
    expect(object.animationIsPlaying()).toBe(false);
    expect(animationChanges).toContainEqual({
      name: "stand",
      isPlaying: false,
    });
  });
});
