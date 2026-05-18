import type { RpgActionInput, RpgActionName } from "@rpgjs/common";

export type KeyboardActionDataResolver<TClient = any, TSprite = any> = (
  client: TClient,
  sprite: TSprite,
) => any;

export interface KeyboardActionConfig<TClient = any, TSprite = any> {
  bind: any;
  action?: RpgActionName;
  data?: any | KeyboardActionDataResolver<TClient, TSprite>;
}

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

export function isKeyboardActionConfig(value: any): value is KeyboardActionConfig {
  return value !== null
    && typeof value === "object"
    && Object.prototype.hasOwnProperty.call(value, "bind");
}

export function getKeyboardControlBind(control: any): any {
  return isKeyboardActionConfig(control) ? control.bind : control;
}

export function resolveKeyboardActionInput(
  control: any,
  client: any,
  sprite: any,
  defaultAction: RpgActionName = "action",
): RpgActionInput {
  if (!isKeyboardActionConfig(control)) {
    return { action: defaultAction };
  }

  const action = control.action ?? defaultAction;
  const data = typeof control.data === "function"
    ? control.data(client, sprite)
    : control.data;

  return data === undefined
    ? { action }
    : { action, data };
}
