import type { Control, Direction } from "./Player";

export type RpgActionName = string | number | Control;

export interface RpgActionInput<TData = any> {
  action: RpgActionName;
  data?: TData;
}

export interface RpgMoveInput {
  type: "move";
  direction: Direction;
}

export interface RpgDashInput {
  type: "dash";
  direction: { x: number; y: number };
  additionalSpeed?: number;
  duration?: number;
  cooldown?: number;
}

export type RpgMovementInput = Direction | RpgMoveInput | RpgDashInput;
