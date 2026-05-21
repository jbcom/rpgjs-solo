import { describe, expect, test, vi } from "vitest";
import {
  hasActionBattlePhysicsBody,
  isActionBattleMovementResolutionError,
  safeActionBattleDash,
} from "./movement";

describe("action battle movement helpers", () => {
  test("does not dash when the entity physics body has already been removed", () => {
    const entity = {
      id: "enemy-1",
      getCurrentMap: vi.fn(() => ({
        getBody: vi.fn(() => undefined),
      })),
      dash: vi.fn(),
    };

    expect(safeActionBattleDash(entity, { x: 1, y: 0 }, 10, 200)).toBe(false);
    expect(entity.dash).not.toHaveBeenCalled();
  });

  test("dashes when the entity still has a physics body", () => {
    const entity = {
      id: "enemy-1",
      getCurrentMap: vi.fn(() => ({
        getBody: vi.fn(() => ({ id: "enemy-1" })),
      })),
      dash: vi.fn(),
    };

    expect(safeActionBattleDash(entity, { x: 1, y: 0 }, 10, 200)).toBe(true);
    expect(entity.dash).toHaveBeenCalledWith({ x: 1, y: 0 }, 10, 200);
  });

  test("absorbs teardown races between body check and dash registration", () => {
    const entity = {
      id: "enemy-1",
      getCurrentMap: vi.fn(() => ({
        getBody: vi.fn(() => ({ id: "enemy-1" })),
      })),
      dash: vi.fn(() => {
        throw new Error("MovementManager: unable to resolve entity for identifier enemy-1.");
      }),
    };

    expect(safeActionBattleDash(entity, { x: 1, y: 0 }, 10, 200)).toBe(false);
  });

  test("keeps unexpected movement errors visible", () => {
    const entity = {
      id: "enemy-1",
      getCurrentMap: vi.fn(() => ({
        getBody: vi.fn(() => ({ id: "enemy-1" })),
      })),
      dash: vi.fn(() => {
        throw new Error("boom");
      }),
    };

    expect(() => safeActionBattleDash(entity, { x: 1, y: 0 }, 10, 200)).toThrow(
      "boom"
    );
  });

  test("detects unavailable bodies only when the map exposes body lookup", () => {
    expect(
      hasActionBattlePhysicsBody({
        id: "enemy-1",
        getCurrentMap: () => ({}),
      })
    ).toBe(true);
    expect(
      isActionBattleMovementResolutionError(
        new Error("MovementManager: unable to resolve entity for identifier enemy-1.")
      )
    ).toBe(true);
  });
});
