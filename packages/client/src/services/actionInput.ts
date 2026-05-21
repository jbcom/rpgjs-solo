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

const KEY_CODE_NAMES: Record<number, string> = {
  32: "space",
  27: "escape",
  37: "left",
  38: "up",
  39: "right",
  40: "down",
};

const normalizeKeyboardName = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (
    normalized === " " ||
    normalized === "spacebar" ||
    normalized === "space"
  ) {
    return "space";
  }
  if (normalized.startsWith("arrow")) {
    return normalized.slice("arrow".length);
  }
  return normalized;
};

export function keyboardEventMatchesBind(
  event: KeyboardEvent,
  bind: any
): boolean {
  if (Array.isArray(bind)) {
    return bind.some(item => keyboardEventMatchesBind(event, item));
  }

  if (typeof bind === "number") {
    return event.keyCode === bind;
  }

  const expected = normalizeKeyboardName(bind);
  if (!expected) return false;

  return (
    normalizeKeyboardName(event.key) === expected ||
    normalizeKeyboardName(event.code) === expected ||
    KEY_CODE_NAMES[event.keyCode] === expected
  );
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
