import { describe, expect, test } from "vitest";
import {
  getTriggerTouchTarget,
  triggerMatchesExecution,
} from "../src/touch-runtime";

describe("Studio touch runtime helpers", () => {
  test("defaults onTouch triggers to player touch for compatibility", () => {
    expect(getTriggerTouchTarget({ type: "onTouch" })).toBe("player");
    expect(triggerMatchesExecution({ type: "onTouch" }, "onTouch", "player")).toBe(true);
    expect(triggerMatchesExecution({ type: "onTouch" }, "onTouch", "event")).toBe(false);
  });

  test("matches event touch only when touchTarget is event", () => {
    const trigger = { type: "onTouch", typeData: { touchTarget: "event" } };

    expect(getTriggerTouchTarget(trigger)).toBe("event");
    expect(triggerMatchesExecution(trigger, "onTouch", "event")).toBe(true);
    expect(triggerMatchesExecution(trigger, "onTouch", "player")).toBe(false);
  });

  test("does not apply touchTarget filtering to non-touch triggers", () => {
    expect(triggerMatchesExecution({ type: "onAction" }, "onAction", "event")).toBe(true);
    expect(triggerMatchesExecution({ type: "onAction" }, "onTouch", "event")).toBe(false);
  });
});
