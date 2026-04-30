import { describe, expect, test } from "vitest";
import {
  createStudioDefaultClass,
  normalizeStudioSkillsToLearn,
} from "../src/skills-to-learn";

describe("Studio skillsToLearn", () => {
  test("normalizes Studio skill progression entries for RPGJS classes", () => {
    expect(
      normalizeStudioSkillsToLearn([
        { level: "5", skillId: "fire" },
        { level: 1, skill: "slash" },
        { level: 5, skillId: "fire" },
        { level: 0, id: "guard" },
        { level: "bad", skillId: "skip" },
      ]),
    ).toEqual([
      { level: 1, skill: "slash", source: "studio" },
      { level: 1, skill: "guard", source: "studio" },
      { level: 5, skill: "fire", source: "studio" },
    ]);
  });

  test("creates a default class only when skills exist", () => {
    expect(createStudioDefaultClass([])).toBeNull();
    expect(createStudioDefaultClass([{ level: 3, skillId: "ice" }])).toEqual({
      id: "studio-default-class",
      name: "Studio Default Class",
      skillsToLearn: [{ level: 3, skill: "ice", source: "studio" }],
    });
  });
});
