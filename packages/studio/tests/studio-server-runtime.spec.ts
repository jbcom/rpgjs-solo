import { describe, expect, test } from "vitest";
import { resolveRuntimeEventHitbox } from "../src/server";

describe("Studio server runtime", () => {
  test("resolves the runtime event hitbox from the game map payload", () => {
    expect(resolveRuntimeEventHitbox({
      hitbox: { width: 56, height: 50 },
      triggers: [
        { enabled: true, hitbox: { width: 32, height: 32 } },
      ],
    }, {})).toEqual({
      width: 56,
      height: 50,
    });
  });

  test("falls back to the last enabled trigger hitbox", () => {
    expect(resolveRuntimeEventHitbox({
      triggers: [
        { enabled: true, hitbox: { width: 18, height: 26 } },
        { enabled: false, hitbox: { width: 90, height: 90 } },
        { enabled: true, hitbox: { width: 56, height: 50 } },
      ],
    }, {})).toEqual({
      width: 56,
      height: 50,
    });
  });

  test("supports physics-style hitbox keys from params", () => {
    expect(resolveRuntimeEventHitbox({}, {
      hitbox: { w: 24, h: 40 },
    })).toEqual({
      width: 24,
      height: 40,
    });
  });
});
