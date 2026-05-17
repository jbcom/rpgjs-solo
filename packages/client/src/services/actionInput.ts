import type { RpgActionInput, RpgActionName } from "@rpgjs/common";

export function normalizeActionInput(action: RpgActionName, data?: any): RpgActionInput;
export function normalizeActionInput(action: RpgActionInput): RpgActionInput;
export function normalizeActionInput(action: RpgActionName | RpgActionInput, data?: any): RpgActionInput {
  if (typeof action === "object") {
    return action;
  }
  return data === undefined
    ? { action }
    : { action, data };
}
