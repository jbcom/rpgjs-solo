import type { RpgCommonMap, MapHitboxQueryKind, MapHitboxQueryRect } from "../Map";

export type MapAreaTargetKind = MapHitboxQueryKind | "custom";

export type MapAreaTargetSelector =
  | MapAreaTargetKind
  | MapAreaTargetKind[]
  | "all";

export interface MapAreaPoint {
  x: number;
  y: number;
}

export interface MapAreaTargetBounds extends MapAreaPoint {
  width: number;
  height: number;
}

export type MapAreaCenter =
  | MapAreaPoint
  | {
      id?: string;
      x: number | (() => number);
      y: number | (() => number);
      hitbox?:
        | (() => { w?: number; h?: number; width?: number; height?: number })
        | { w?: number; h?: number; width?: number; height?: number };
    };

export interface MapAreaCandidate<TTarget = unknown> {
  target: TTarget;
  id: string;
  kind: MapAreaTargetKind;
  x: number;
  y: number;
  bounds: MapAreaTargetBounds;
}

export interface MapAreaContext {
  map: RpgCommonMap<any>;
  center: MapAreaPoint;
}

export interface MapAreaShape<TTarget = unknown> {
  bounds(ctx: MapAreaContext): MapHitboxQueryRect;
  contains(target: MapAreaCandidate<TTarget>, ctx: MapAreaContext): boolean;
  distance?(target: MapAreaCandidate<TTarget>, ctx: MapAreaContext): number;
  maxDistance?(ctx: MapAreaContext): number | undefined;
}

export interface MapAreaFalloff {
  linear(): number;
  inverse(): number;
  step(thresholds?: number[]): number;
}

export interface MapAreaHit<TTarget = unknown> extends MapAreaCandidate<TTarget> {
  distance: number;
  distanceRatio: number;
  falloff: MapAreaFalloff;
}

export interface MapAreaQueryOptions<TCustom = unknown> {
  center: MapAreaCenter;
  shape: MapAreaShape<TCustom | any>;
  targets?: MapAreaTargetSelector;
  customTargets?: TCustom[];
  excludeIds?: string[];
  filter?: (target: MapAreaCandidate<TCustom | any>) => boolean;
}

export interface AreaShapeOffset {
  x?: number;
  y?: number;
}

export interface AreaShapeCircleOptions {
  radius: number;
  offset?: AreaShapeOffset;
}

export interface AreaShapeRectOptions {
  width: number;
  height: number;
  offset?: AreaShapeOffset;
  angle?: number;
}

export interface AreaShapeLineOptions {
  length: number;
  thickness: number;
  direction: "up" | "down" | "left" | "right" | MapAreaPoint;
  offset?: AreaShapeOffset;
}

export interface AreaShapeCrossOptions {
  armLength: number;
  thickness: number;
  offset?: AreaShapeOffset;
}

export interface AreaShapeCustomOptions<TTarget = unknown> {
  bounds: MapAreaShape<TTarget>["bounds"];
  contains: MapAreaShape<TTarget>["contains"];
  distance?: MapAreaShape<TTarget>["distance"];
  maxDistance?: MapAreaShape<TTarget>["maxDistance"];
}
