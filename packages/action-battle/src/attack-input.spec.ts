import { describe, expect, test, vi } from "vitest";
import {
  applyActionBattleAttackDirection,
  resolveActionBattleAttackDirection,
} from "./attack-input";

describe("action battle attack input", () => {
  test("prefers the direction carried by the action payload", () => {
    const entity = {
      getDirection: () => "left",
    };

    expect(
      resolveActionBattleAttackDirection(entity, {
        data: { direction: "right" },
      })
    ).toBe("right");
  });

  test("falls back to the entity direction when the payload is missing", () => {
    const entity = {
      getDirection: () => "up",
    };

    expect(resolveActionBattleAttackDirection(entity)).toBe("up");
  });

  test("applies the captured attack direction before direction lock", () => {
    const entity = {
      changeDirection: vi.fn(),
    };

    applyActionBattleAttackDirection(entity, "down");

    expect(entity.changeDirection).toHaveBeenCalledWith("down");
  });
});
