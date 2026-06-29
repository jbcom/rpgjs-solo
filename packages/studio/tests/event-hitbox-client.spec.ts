import { describe, expect, test, vi } from "vitest";
import {
  applyStudioEventHitbox,
  resolveStudioEventHitboxForSync,
} from "../src/event-hitbox-client";

describe("Studio client event hitbox sync", () => {
  test("uses setHitbox when it updates the event hitbox signal", () => {
    let value = { w: 32, h: 32 };
    const event = {
      hitbox: Object.assign(() => value, {
        set: vi.fn((next) => {
          value = next;
        }),
      }),
      setHitbox: vi.fn((width, height) => {
        value = { w: width, h: height };
      }),
    };

    applyStudioEventHitbox(event, { width: 56, height: 50 });

    expect(event.setHitbox).toHaveBeenCalledWith(56, 50);
    expect(event.hitbox.set).not.toHaveBeenCalled();
    expect(event.hitbox()).toEqual({ w: 56, h: 50 });
  });

  test("falls back to hitbox.set when setHitbox does not update the signal", () => {
    let value = { w: 32, h: 32 };
    const event = {
      hitbox: Object.assign(() => value, {
        set: vi.fn((next) => {
          value = next;
        }),
      }),
      setHitbox: vi.fn(),
    };

    applyStudioEventHitbox(event, { width: 56, height: 50 });

    expect(event.setHitbox).toHaveBeenCalledWith(56, 50);
    expect(event.hitbox.set).toHaveBeenCalledWith({ w: 56, h: 50 });
    expect(event.hitbox()).toEqual({ w: 56, h: 50 });
  });

  test("keeps a runtime hitbox override across client Studio hitbox syncs", () => {
    const event = {
      __rpgjsRuntimeHitbox: { width: 60, height: 60 },
    };

    expect(resolveStudioEventHitboxForSync(event, { width: 109, height: 108 })).toEqual({
      width: 60,
      height: 60,
    });
    expect(resolveStudioEventHitboxForSync(event, { width: 109, height: 108 })).toEqual({
      width: 60,
      height: 60,
    });
  });

  test("uses an explicit runtime hitbox override when the event object was replaced", () => {
    const event = {};

    expect(
      resolveStudioEventHitboxForSync(
        event,
        { width: 109, height: 108 },
        { width: 60, height: 60 },
      ),
    ).toEqual({
      width: 60,
      height: 60,
    });
    expect((event as any).__rpgjsRuntimeHitbox).toEqual({ width: 60, height: 60 });
  });

  test("drops a runtime hitbox override when the configured hitbox changes", () => {
    const event = {
      __rpgjsRuntimeHitbox: { width: 60, height: 60 },
    };

    expect(resolveStudioEventHitboxForSync(event, { width: 109, height: 108 })).toEqual({
      width: 60,
      height: 60,
    });
    expect(resolveStudioEventHitboxForSync(event, { width: 32, height: 48 })).toEqual({
      width: 32,
      height: 48,
    });
    expect((event as any).__rpgjsRuntimeHitbox).toBeUndefined();
  });
});
