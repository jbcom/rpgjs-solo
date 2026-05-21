import { describe, expect, test, vi } from "vitest";
import {
  ACTION_BATTLE_HIT_FX_COMPONENT_ID,
  createActionBattleVisual,
  usesActionBattleFxVisual,
} from "./visual";

const createEntity = () => ({
  flash: vi.fn(),
  showHit: vi.fn(),
  showComponentAnimation: vi.fn(),
  setGraphicAnimation: vi.fn(),
});

describe("action battle visual composer", () => {
  test("classic hit uses the low-level flash and damage text primitives", () => {
    const target = createEntity();
    const visual = createActionBattleVisual("classic");

    visual({
      moment: "hit",
      target,
      damage: 12,
    });

    expect(target.flash).toHaveBeenCalledWith({
      type: "tint",
      tint: "red",
      duration: 200,
      cycles: 1,
    });
    expect(target.showHit).toHaveBeenCalledWith("-12");
  });

  test("fx hit keeps classic feedback and adds a CanvasEngine Fx component animation", () => {
    const target = createEntity();
    const visual = createActionBattleVisual("fx");

    visual({
      moment: "hit",
      target,
      damage: 9,
    });

    expect(target.showHit).toHaveBeenCalledWith("-9");
    expect(target.showComponentAnimation).toHaveBeenCalledWith(
      ACTION_BATTLE_HIT_FX_COMPONENT_ID,
      expect.objectContaining({
        name: "hitSpark",
      })
    );
    expect(usesActionBattleFxVisual(visual)).toBe(true);
  });

  test("custom composer parts receive helpers", () => {
    const target = createEntity();
    const visual = createActionBattleVisual({
      hit({ target }, fx) {
        fx.component(target, "custom-hit", { name: "impactBurst" });
      },
    });

    visual({
      moment: "hit",
      target,
      damage: 3,
    });

    expect(target.showComponentAnimation).toHaveBeenCalledWith("custom-hit", {
      name: "impactBurst",
    });
  });
});
