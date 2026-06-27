export type StudioTouchTarget = "player" | "event";

export const getTriggerTouchTarget = (trigger: any): StudioTouchTarget => {
  return trigger?.typeData?.touchTarget === "event" ? "event" : "player";
};

export const triggerMatchesExecution = (
  trigger: any,
  triggerType: string,
  touchTarget?: StudioTouchTarget,
): boolean => {
  if (!trigger || trigger.type !== triggerType) return false;
  if (triggerType !== "onTouch") return true;
  return getTriggerTouchTarget(trigger) === (touchTarget ?? "player");
};
