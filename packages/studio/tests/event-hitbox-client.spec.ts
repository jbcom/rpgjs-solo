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

  test("applies the configured hitbox over the default client hitbox", () => {
    const event = {
      hitbox: () => ({ w: 32, h: 32 }),
    };

    expect(resolveStudioEventHitboxForSync(event, { width: 109, height: 108 })).toEqual({
      width: 109,
      height: 108,
    });
  });

  test("keeps the synchronized hitbox when it differs from the Studio config", () => {
    const event = {
      hitbox: () => ({ w: 60, h: 60 }),
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

  test("keeps a synchronized page hitbox after a configured hitbox was applied", () => {
    let value = { w: 109, h: 108 };
    const event = {
      hitbox: () => value,
    };

    expect(resolveStudioEventHitboxForSync(event, { width: 109, height: 108 })).toEqual({
      width: 109,
      height: 108,
    });

    value = { w: 32, h: 32 };

    expect(resolveStudioEventHitboxForSync(event, { width: 109, height: 108 })).toEqual({
      width: 32,
      height: 32,
    });
  });

  test("updates a previously applied configured hitbox when the Studio config changes", () => {
    let value = { w: 109, h: 108 };
    const event = {
      hitbox: () => value,
    };

    expect(resolveStudioEventHitboxForSync(event, { width: 109, height: 108 })).toEqual({
      width: 109,
      height: 108,
    });

    expect(resolveStudioEventHitboxForSync(event, { width: 32, height: 48 })).toEqual({
      width: 32,
      height: 48,
    });
  });
});
