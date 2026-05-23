import type { RpgCommonPlayer } from "../../Player";
import type { RpgCommonMap, MapHitboxQueryKind } from "../Map";
import {
  clamp01,
  createFalloff,
  distance,
  maxDistanceFromBounds,
  normalizeHitbox,
  pointInRect,
  readNumber,
  rectsIntersect,
  resolveAreaPoint,
} from "./utils";
import type {
  MapAreaCandidate,
  MapAreaContext,
  MapAreaHit,
  MapAreaQueryOptions,
  MapAreaTargetKind,
  MapAreaTargetSelector,
} from "./types";

const normalizeAreaKinds = (
  selector: MapAreaTargetSelector | undefined,
  hasCustomTargets: boolean
): Set<MapAreaTargetKind> => {
  if (selector === "all") return new Set(["players", "events", "custom"]);
  if (!selector) {
    return new Set(hasCustomTargets ? ["players", "events", "custom"] : ["players", "events"]);
  }
  return new Set(Array.isArray(selector) ? selector : [selector]);
};

const targetToAreaCandidate = <TTarget>(
  target: TTarget,
  kind: MapAreaTargetKind,
  fallbackId: string
): MapAreaCandidate<TTarget> | undefined => {
  const raw = target as any;
  const id = String(raw?.id ?? raw?.uuid ?? fallbackId);
  const x = readNumber(raw?.x);
  const y = readNumber(raw?.y);
  const { width, height } = normalizeHitbox(raw);
  const bounds = {
    x,
    y,
    width,
    height,
  };

  return {
    target,
    id,
    kind,
    x: x + width / 2,
    y: y + height / 2,
    bounds,
  };
};

export function queryArea<TMapPlayer extends RpgCommonPlayer, TCustom = unknown>(
  map: RpgCommonMap<TMapPlayer>,
  options: MapAreaQueryOptions<TCustom>
): Array<MapAreaHit<TCustom | TMapPlayer | any>> {
  const center = resolveAreaPoint(options.center);
  const ctx: MapAreaContext = { map, center };
  const bounds = options.shape.bounds(ctx);
  const kinds = normalizeAreaKinds(
    options.targets,
    Array.isArray(options.customTargets) && options.customTargets.length > 0
  );
  const excluded = new Set(options.excludeIds ?? []);
  const candidates = new Map<string, MapAreaCandidate<TCustom | TMapPlayer | any>>();

  if (kinds.has("players") || kinds.has("events")) {
    const hitboxKinds = [...kinds].filter(
      (kind): kind is MapHitboxQueryKind => kind === "players" || kind === "events"
    );
    for (const target of map.queryHitbox(bounds, {
      excludeIds: options.excludeIds,
      kinds: hitboxKinds,
    })) {
      const id = (target as any)?.id;
      const kind: MapAreaTargetKind = id && map.players()[id] ? "players" : "events";
      const candidate = targetToAreaCandidate(
        target,
        kind,
        `${kind}:${candidates.size}`
      );
      if (candidate && !excluded.has(candidate.id)) {
        candidates.set(candidate.id, candidate);
      }
    }
  }

  if (kinds.has("custom")) {
    for (const [index, target] of (options.customTargets ?? []).entries()) {
      const candidate = targetToAreaCandidate(target, "custom", `custom:${index}`);
      if (!candidate || excluded.has(candidate.id)) continue;
      const isPoint = candidate.bounds.width <= 0 || candidate.bounds.height <= 0;
      if (isPoint ? pointInRect(candidate, bounds) : rectsIntersect(candidate.bounds, bounds)) {
        candidates.set(candidate.id, candidate);
      }
    }
  }

  const maxDistance =
    options.shape.maxDistance?.(ctx) ?? maxDistanceFromBounds(center, bounds);

  return Array.from(candidates.values())
    .filter((candidate) => options.filter?.(candidate) ?? true)
    .filter((candidate) => options.shape.contains(candidate, ctx))
    .map((candidate) => {
      const hitDistance =
        options.shape.distance?.(candidate, ctx) ?? distance(center, candidate);
      return {
        ...candidate,
        distance: hitDistance,
        distanceRatio: maxDistance > 0 ? clamp01(hitDistance / maxDistance) : 0,
        falloff: createFalloff(hitDistance, maxDistance),
      };
    });
}
