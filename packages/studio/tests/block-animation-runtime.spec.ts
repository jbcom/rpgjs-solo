import { describe, expect, test, vi } from "vitest";
import { erase_event } from "../runtime/blocks/executors/erase-event";
import { schemaShowAnimation, show_animation } from "../runtime/blocks/executors/show-animation";
import { getSerializablePosition } from "../runtime/blocks/executors/utils";

describe("Studio animation block runtime", () => {
  test("normalizes reactive RPGJS characters to plain animation positions", () => {
    expect(
      getSerializablePosition({
        x: () => 48,
        y: () => 96,
      }),
    ).toEqual({ x: 48, y: 96 });
  });

  test("removes events with a sprite transition when an erase animation is configured", async () => {
    const event = {
      x: () => 128,
      y: () => 256,
      remove: vi.fn(),
    };
    const context: any = {
      player: {
        getCurrentMap: () => ({}),
      },
      event,
    };

    await erase_event(context, {
      eventId: "$this",
      animation: "vanish",
    });

    expect(event.remove).toHaveBeenCalledWith({
      reason: "erase_event",
      transition: {
        animation: "default",
        graphic: "vanish",
        duration: 1200,
      },
      timeoutMs: 1200,
    });
  });

  test("shows event-targeted animations with a serializable map position", async () => {
    const event = {
      x: () => 16,
      y: () => 32,
    };
    const showAnimation = vi.fn();
    const context: any = {
      player: {
        getCurrentMap: () => ({
          getEvent: () => event,
          showAnimation,
        }),
      },
    };

    await show_animation(context, {
      targetType: "event",
      eventId: "event-1",
      spritesheet: "spark",
    });

    expect(showAnimation).toHaveBeenCalledWith({ x: 16, y: 32 }, "spark", "default");
  });

  test("requires the spritesheet field in the show animation schema", () => {
    expect(schemaShowAnimation.schema.required).toContain("spritesheet");
    expect(schemaShowAnimation.schema.required).not.toContain("graphic");
  });
});
