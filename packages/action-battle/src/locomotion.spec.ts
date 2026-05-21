import { describe, expect, test, vi } from "vitest";
import { forceActionBattleLocomotionAnimation } from "./locomotion";

describe("action battle locomotion helpers", () => {
  test("temporarily unlocks animation to restore locomotion state", () => {
    const entity = {
      animationFixed: true,
      setGraphicAnimation: vi.fn(function (this: { animationFixed: boolean }) {
        expect(this.animationFixed).toBe(false);
      }),
    };

    forceActionBattleLocomotionAnimation(entity, "stand");

    expect(entity.setGraphicAnimation).toHaveBeenCalledWith("stand");
    expect(entity.animationFixed).toBe(true);
  });

  test("updates client-side animation signals when no server animation API exists", () => {
    const setAnimationName = vi.fn();
    const entity = {
      animationFixed: false,
      animationName: {
        set: setAnimationName,
      },
      resetAnimationState: vi.fn(),
    };

    forceActionBattleLocomotionAnimation(entity, "stand");

    expect(setAnimationName).toHaveBeenCalledWith("stand");
    expect(entity.resetAnimationState).toHaveBeenCalled();
    expect(entity.resetAnimationState.mock.invocationCallOrder[0]).toBeLessThan(
      setAnimationName.mock.invocationCallOrder[0]
    );
  });
});
