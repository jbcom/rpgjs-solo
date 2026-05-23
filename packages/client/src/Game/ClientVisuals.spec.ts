import { describe, expect, test, vi } from "vitest";
import { ClientVisualRegistry } from "./ClientVisuals";

describe("ClientVisualRegistry", () => {
  test("plays registered visual handlers with resolved objects and helpers", async () => {
    const target = {
      flash: vi.fn(),
      showHit: vi.fn(),
      setAnimation: vi.fn(),
    };
    const componentAnimation = {
      displayEffect: vi.fn(),
    };
    const engine = {
      scene: {},
      getObjectById: vi.fn(() => target),
      getComponentAnimation: vi.fn(() => componentAnimation),
      playSound: vi.fn().mockResolvedValue(undefined),
      mapShakeTrigger: {
        start: vi.fn(),
      },
    } as any;
    const registry = new ClientVisualRegistry();

    registry.register("hit", ({ target, data }, helpers) => {
      helpers.flash(target, { type: "tint", tint: "red" });
      helpers.showHit(target, `-${data.damage}`);
      helpers.component("hit-spark", target, { scale: 2 });
      helpers.sound("hit");
      helpers.animation(target, "hurt");
      helpers.shake({ intensity: 2 });
    });

    await registry.play(
      {
        name: "hit",
        data: {
          targetId: "enemy-1",
          damage: 12,
        },
      },
      engine
    );

    expect(engine.getObjectById).toHaveBeenCalledWith("enemy-1");
    expect(target.flash).toHaveBeenCalledWith({ type: "tint", tint: "red" });
    expect(target.showHit).toHaveBeenCalledWith("-12");
    expect(componentAnimation.displayEffect).toHaveBeenCalledWith(
      { scale: 2 },
      target
    );
    expect(engine.playSound).toHaveBeenCalledWith("hit", undefined);
    expect(target.setAnimation).toHaveBeenCalledWith("hurt", 1);
    expect(engine.mapShakeTrigger.start).toHaveBeenCalledWith({ intensity: 2 });
  });
});
