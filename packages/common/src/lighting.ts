export type LightingColor = string | number | [number, number, number];

export interface LightingAmbient {
  darkness?: number;
  darkColor?: LightingColor;
  fogColor?: LightingColor;
  fogRadius?: number;
  fogSoftness?: number;
  fogOpacity?: number;
}

export interface LightSpot {
  id?: string;
  x: number;
  y: number;
  radius?: number;
  intensity?: number;
  color?: LightingColor;
  flicker?: boolean;
  flickerSpeed?: number;
  pulse?: boolean;
  pulseSpeed?: number;
  phase?: number;
}

export interface LightingSun {
  x?: number;
  y?: number;
  z?: number;
  radius?: number;
  intensity?: number;
  shadowWeight?: number;
  enabled?: boolean;
}

export interface LightingAmbientLight {
  x: number;
  y: number;
  z?: number;
  intensity?: number;
  shadowWeight?: number;
  length?: number;
  enabled?: boolean;
}

export interface LightingShadows {
  enabled?: boolean;
  mode?: "strongest" | "blend2";
  updateHz?: number;
  scanHz?: number;
  cullToViewport?: boolean;
  minInfluence?: number;
  falloffPower?: number;
  ambientLight?: LightingAmbientLight | null;
  shadowColor?: LightingColor;
}

export interface LightingState {
  ambient?: LightingAmbient;
  spots?: LightSpot[];
  sun?: LightingSun;
  shadows?: LightingShadows;
}

export interface LightingTransitionOptions {
  duration?: number;
  easing?: "linear" | "easeInOut";
}

export const DEFAULT_DAY_LIGHTING: LightingState = {
  ambient: {
    darkness: 0,
    darkColor: "#000000",
    fogColor: "#141424",
    fogOpacity: 0.35,
  },
  sun: {
    intensity: 1,
    enabled: true,
  },
  shadows: {
    enabled: false,
    mode: "strongest",
    updateHz: 30,
    shadowColor: "#05070d",
  },
};

export const DEFAULT_NIGHT_LIGHTING: LightingState = {
  ambient: {
    darkness: 0.45,
    darkColor: "#0a1020",
    fogColor: "#141a2a",
    fogOpacity: 0.35,
  },
  sun: {
    intensity: 0.35,
    enabled: true,
  },
  shadows: {
    enabled: true,
    mode: "strongest",
    updateHz: 30,
    shadowColor: "#05070d",
  },
};

export function cloneLightingState(lighting: LightingState | null | undefined): LightingState | null {
  if (!lighting) {
    return null;
  }
  return {
    ...lighting,
    ambient: lighting.ambient ? { ...lighting.ambient } : undefined,
    spots: lighting.spots ? lighting.spots.map((spot) => ({ ...spot })) : undefined,
    sun: lighting.sun ? { ...lighting.sun } : undefined,
    shadows: lighting.shadows ? { ...lighting.shadows } : undefined,
  };
}

export function mergeLightingState(
  current: LightingState | null | undefined,
  patch: Partial<LightingState>
): LightingState {
  return {
    ...(current ?? {}),
    ...patch,
    ambient: patch.ambient
      ? {
          ...(current?.ambient ?? {}),
          ...patch.ambient,
        }
      : current?.ambient,
    spots: patch.spots ? patch.spots.map((spot) => ({ ...spot })) : current?.spots?.map((spot) => ({ ...spot })),
    sun: patch.sun
      ? {
          ...(current?.sun ?? {}),
          ...patch.sun,
        }
      : current?.sun,
    shadows: patch.shadows
      ? {
          ...(current?.shadows ?? {}),
          ...patch.shadows,
        }
      : current?.shadows,
  };
}

export function normalizeLightingState(value: unknown): LightingState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as LightingState;
  const next: LightingState = {};

  if (raw.ambient && typeof raw.ambient === "object") {
    next.ambient = { ...raw.ambient };
  }
  if (Array.isArray(raw.spots)) {
    next.spots = raw.spots
      .filter((spot): spot is LightSpot => {
        return !!spot
          && typeof spot === "object"
          && Number.isFinite(Number((spot as LightSpot).x))
          && Number.isFinite(Number((spot as LightSpot).y));
      })
      .map((spot) => ({
        ...spot,
        x: Number(spot.x),
        y: Number(spot.y),
      }));
  }
  if (raw.sun && typeof raw.sun === "object") {
    next.sun = { ...raw.sun };
  }
  if (raw.shadows && typeof raw.shadows === "object") {
    next.shadows = { ...raw.shadows };
  }

  return Object.keys(next).length > 0 ? next : null;
}
