import type { Control } from "./Player";

export type RpgActionName = string | number | Control;

export interface RpgActionInput<TData = any> {
  action: RpgActionName;
  data?: TData;
}
