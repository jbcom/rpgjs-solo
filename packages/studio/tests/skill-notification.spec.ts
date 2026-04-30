import { describe, expect, test } from "vitest";
import { getStudioSkillChangeNotification } from "../src/skill-notification";

describe("Studio skill change notification", () => {
  test("returns a notification for learned skills", () => {
    expect(
      getStudioSkillChangeNotification({
        action: "learn",
        skill: { name: "Fire" },
        skillId: "fire",
      }),
    ).toEqual({
      message: "Learned Fire",
      type: "info",
    });
  });

  test("returns a warning notification for forgotten skills", () => {
    expect(
      getStudioSkillChangeNotification({
        action: "forget",
        skillId: "fire",
      }),
    ).toEqual({
      message: "Forgot fire",
      type: "warn",
    });
  });
});
