import { describe, expect, test, vi } from "vitest";
import { signal } from "canvasengine";

const fakeEngine = {
  controlsReady: signal(true),
};

vi.mock("../../../core/inject", () => ({
  inject: vi.fn(() => fakeEngine),
}));

describe("withMobile", () => {
  test("registers the mobile GUI with default options", async () => {
    const { withMobile } = await import("./index");

    const module = withMobile();
    const gui = module.gui[0];

    expect(gui.id).toBe("mobile-gui");
    expect(gui.autoDisplay).toBe(true);
    expect(gui.data).toEqual({});
  });

  test("passes options to the GUI and resolves enabled dependencies", async () => {
    const { withMobile } = await import("./index");

    const module = withMobile({
      id: "touch-controls",
      enabled: "always",
      joystick: {
        outerColor: "#111111",
        innerColor: "#eeeeee",
        scale: 0.8,
        outerScale: { x: 0.8, y: 0.8 },
        innerScale: { x: 0.9, y: 0.9 },
        moveInterval: 40,
        threshold: 0.2,
      },
      buttons: {
        action: true,
        back: false,
        dash: true,
      },
    });
    const gui = module.gui[0];
    const dependencies = gui.dependencies();

    expect(gui.id).toBe("touch-controls");
    expect(gui.data.buttons?.dash).toBe(true);
    expect(gui.data.joystick).toMatchObject({
      outerColor: "#111111",
      innerColor: "#eeeeee",
      scale: 0.8,
      outerScale: { x: 0.8, y: 0.8 },
      innerScale: { x: 0.9, y: 0.9 },
      moveInterval: 40,
      threshold: 0.2,
    });
    expect(dependencies[0]()).toBe(true);
    expect(dependencies[1]()).toBe(true);
  });

  test("keeps the auto detector unresolved when mobile is disabled", async () => {
    const { withMobile } = await import("./index");

    const dependencies = withMobile({ enabled: "never" }).gui[0].dependencies();

    expect(dependencies[0]()).toBeUndefined();
  });
});
