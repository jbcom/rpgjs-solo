import { describe, expect, test } from "vitest";
import {
  getKeyboardControlBind,
  keyboardEventMatchesBind,
  normalizeActionInput,
  resolveKeyboardActionInput,
  resolveKeyboardDirectionInput,
} from "./actionInput";

const keyboardEvent = (values: Partial<KeyboardEvent>) =>
  values as KeyboardEvent;

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

describe("keyboard action controls", () => {
  test("keeps string controls compatible", () => {
    expect(getKeyboardControlBind("space")).toBe("space");
    expect(resolveKeyboardActionInput("space", {}, {})).toEqual({
      action: "action",
    });
  });

  test("resolves object controls with static data", () => {
    const control = {
      bind: "space",
      action: "projectile:shoot",
      data: {
        source: "keyboard",
        target: { x: 10, y: 20 },
      },
    };

    expect(getKeyboardControlBind(control)).toBe("space");
    expect(resolveKeyboardActionInput(control, {}, {})).toEqual({
      action: "projectile:shoot",
      data: {
        source: "keyboard",
        target: { x: 10, y: 20 },
      },
    });
  });

  test("resolves object controls with functional data", () => {
    const client = {
      pointer: {
        world: () => ({ x: 64, y: 96 }),
      },
    };
    const sprite = { id: "player-1" };
    const control = {
      bind: "space",
      action: "projectile:shoot",
      data: (resolvedClient: typeof client, resolvedSprite: typeof sprite) => ({
        source: "keyboard",
        target: resolvedClient.pointer.world(),
        playerId: resolvedSprite.id,
      }),
    };

    expect(resolveKeyboardActionInput(control, client, sprite)).toEqual({
      action: "projectile:shoot",
      data: {
        source: "keyboard",
        target: { x: 64, y: 96 },
        playerId: "player-1",
      },
    });
  });

  test("omits data when object controls do not provide it", () => {
    expect(resolveKeyboardActionInput({
      bind: "space",
      action: "projectile:shoot",
    }, {}, {})).toEqual({
      action: "projectile:shoot",
    });
  });

  test("matches keyboard events against string, numeric, and array binds", () => {
    expect(
      keyboardEventMatchesBind(
        keyboardEvent({ key: " ", code: "Space", keyCode: 32 }),
        "space"
      )
    ).toBe(true);
    expect(
      keyboardEventMatchesBind(
        keyboardEvent({ key: "ArrowUp", code: "ArrowUp", keyCode: 38 }),
        "up"
      )
    ).toBe(true);
    expect(
      keyboardEventMatchesBind(
        keyboardEvent({ key: "x", code: "KeyX", keyCode: 88 }),
        ["space", "x"]
      )
    ).toBe(true);
    expect(
      keyboardEventMatchesBind(
        keyboardEvent({ key: "Escape", code: "Escape", keyCode: 27 }),
        27
      )
    ).toBe(true);
    expect(
      keyboardEventMatchesBind(
        keyboardEvent({ key: "a", code: "KeyA", keyCode: 65 }),
        "space"
      )
    ).toBe(false);
  });

  test("resolves directional keyboard controls from a native keyboard event", () => {
    const controls = {
      up: "up",
      down: "down",
      left: "left",
      right: "right",
    };

    expect(
      resolveKeyboardDirectionInput(
        keyboardEvent({ key: "ArrowRight", code: "ArrowRight", keyCode: 39 }),
        controls
      )
    ).toBe("right");
  });
});
