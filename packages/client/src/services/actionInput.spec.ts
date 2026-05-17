import { describe, expect, test } from "vitest";
import { normalizeActionInput } from "./actionInput";

describe("normalizeActionInput", () => {
  test("keeps simple actions compatible", () => {
    expect(normalizeActionInput("action")).toEqual({
      action: "action",
    });
  });

  test("adds custom data to action payloads", () => {
    expect(normalizeActionInput("projectile:shoot", {
      target: { x: 320, y: 180 },
      source: "map-click",
    })).toEqual({
      action: "projectile:shoot",
      data: {
        target: { x: 320, y: 180 },
        source: "map-click",
      },
    });
  });

  test("keeps object-form action payloads intact", () => {
    const payload = {
      action: "projectile:shoot",
      data: { target: { x: 64, y: 96 } },
    };

    expect(normalizeActionInput(payload)).toBe(payload);
  });
});
