export const WEATHER_EFFECTS = ['rain', 'snow', 'fog', 'cloud'] as const;

export const CANVAS_WEATHER_EFFECTS = ['rain', 'snow', 'fog', 'cloud'] as const;

export type WeatherEffect = (typeof WEATHER_EFFECTS)[number];
export type CanvasWeatherEffect = (typeof CANVAS_WEATHER_EFFECTS)[number];

export interface WeatherParams {
  density?: number;
  speed?: number;
  windDirection?: number;
  windStrength?: number;
  maxDrops?: number;
  scale?: number;
  height?: number;
  opacity?: number;
  sunIntensity?: number;
  sunAngle?: number;
  raySpread?: number;
  rayTwinkle?: number;
  rayTwinkleSpeed?: number;
}

export const RAIN_PRESETS = {
  lightRain: { effect: "rain", speed: 0.35, windDirection: 0.1, windStrength: 0.15, density: 110, maxDrops: 90 },
  steadyRain: { effect: "rain", speed: 0.6, windDirection: 0.2, windStrength: 0.3, density: 180, maxDrops: 120 },
  stormRain: { effect: "rain", speed: 1.4, windDirection: 0.7, windStrength: 0.75, density: 300, maxDrops: 150 },
} as const;

export const SNOW_PRESETS = {
  lightSnow: { effect: "snow", speed: 0.35, windDirection: 0.1, windStrength: 0.18, density: 90, maxDrops: 100 },
  winterSnow: { effect: "snow", speed: 0.5, windDirection: 0.2, windStrength: 0.28, density: 150, maxDrops: 130 },
  blizzardSnow: { effect: "snow", speed: 1.1, windDirection: 0.8, windStrength: 0.75, density: 290, maxDrops: 160 },
} as const;

export const FOG_PRESETS = {
  rpgMorningMist: { effect: "fog", speed: 0.16, density: 0.75, height: 0.45, scale: 1.35 },
  rpgForestFog: { effect: "fog", speed: 0.22, density: 1.0, height: 0.62, scale: 1.75 },
  rpgSwampFog: { effect: "fog", speed: 0.14, density: 1.3, height: 0.55, scale: 2.1 },
  rpgNightFog: { effect: "fog", speed: 0.12, density: 1.15, height: 0.58, scale: 1.9 },
  rpgHeavyFog: { effect: "fog", speed: 0.1, density: 1.7, height: 0.72, scale: 2.3 },
} as const;

export const CLOUD_PRESETS = {
  lightClouds: { effect: "cloud", speed: 0.16, density: 0.55, height: 0.72, scale: 1.35, sunIntensity: 1.0, sunAngle: 0.84, raySpread: 0.92, rayTwinkle: 0.25, rayTwinkleSpeed: 0.9 },
  overcastClouds: { effect: "cloud", speed: 0.12, density: 0.95, height: 0.86, scale: 1.85, sunIntensity: 0.4, sunAngle: 0.95, raySpread: 1.15, rayTwinkle: 0.18, rayTwinkleSpeed: 0.7 },
  stormClouds: { effect: "cloud", speed: 0.2, density: 1.25, height: 0.94, scale: 2.2, sunIntensity: 0.12, sunAngle: 1.08, raySpread: 1.35, rayTwinkle: 0.12, rayTwinkleSpeed: 0.6 },
  goldenHourRays: { effect: "cloud", speed: 0.14, density: 0.72, height: 0.82, scale: 1.5, sunIntensity: 1.3, sunAngle: 0.72, raySpread: 0.78, rayTwinkle: 0.78, rayTwinkleSpeed: 1.4 },
  sunnySoftRays: { effect: "cloud", speed: 0.13, density: 0.62, height: 0.76, scale: 1.4, sunIntensity: 1.05, sunAngle: 0.8, raySpread: 0.95, rayTwinkle: 0.35, rayTwinkleSpeed: 0.95 },
  sunsetTwinkleRays: { effect: "cloud", speed: 0.1, density: 0.74, height: 0.84, scale: 1.55, sunIntensity: 1.35, sunAngle: 0.64, raySpread: 0.8, rayTwinkle: 1.0, rayTwinkleSpeed: 1.6 },
  dramaticCrepuscularRays: { effect: "cloud", speed: 0.11, density: 0.9, height: 0.9, scale: 1.9, sunIntensity: 1.5, sunAngle: 0.7, raySpread: 0.68, rayTwinkle: 0.6, rayTwinkleSpeed: 1.2 },
  morningHazeRays: { effect: "cloud", speed: 0.09, density: 0.52, height: 0.7, scale: 1.3, sunIntensity: 0.9, sunAngle: 0.9, raySpread: 1.05, rayTwinkle: 0.42, rayTwinkleSpeed: 0.8 },
} as const;

export const WEATHER_PRESETS_BY_EFFECT = {
  rain: RAIN_PRESETS,
  snow: SNOW_PRESETS,
  fog: FOG_PRESETS,
  cloud: CLOUD_PRESETS,
} as const;

export const WEATHER_PRESETS = {
  ...RAIN_PRESETS,
  ...SNOW_PRESETS,
  ...FOG_PRESETS,
  ...CLOUD_PRESETS,
} as const;

export type WeatherPresetName = keyof typeof WEATHER_PRESETS;
export type WeatherPresetSelection = WeatherPresetName | "custom";

export const WEATHER_PRESET_NAMES = Object.keys(WEATHER_PRESETS) as WeatherPresetName[];
export const WEATHER_PRESET_NAMES_BY_EFFECT = {
  rain: Object.keys(RAIN_PRESETS),
  snow: Object.keys(SNOW_PRESETS),
  fog: Object.keys(FOG_PRESETS),
  cloud: Object.keys(CLOUD_PRESETS),
} as Record<WeatherEffect, WeatherPresetName[]>;

export interface WeatherState {
  effect: WeatherEffect;
  preset?: WeatherPresetSelection;
  params?: WeatherParams;
  transitionMs?: number;
  startedAt?: number;
}

export interface WeatherStatePatch {
  effect?: WeatherEffect;
  preset?: WeatherPresetSelection;
  params?: WeatherParams;
  transitionMs?: number;
  startedAt?: number;
}

export interface WeatherMutationOptions {
  sync?: boolean;
  logger?: Pick<Console, 'warn' | 'debug'>;
}

export interface CanvasWeatherOptions {
  effect: CanvasWeatherEffect;
  density: number;
  speed: number;
  windDirection: number;
  windStrength: number;
  maxDrops: number;
  scale: number;
  height: number;
  sunIntensity: number;
  sunAngle: number;
  raySpread: number;
  rayTwinkle: number;
  rayTwinkleSpeed: number;
  alpha: number;
  zIndex: number;
}

const DEFAULT_TRANSITION_MS = 0;

const DEFAULT_WEATHER_PARAMS: Record<WeatherEffect, Required<WeatherParams>> = {
  rain: {
    density: 120,
    speed: 0.5,
    windDirection: 0,
    windStrength: 0.2,
    maxDrops: 80,
    scale: 2,
    height: 0.5,
    opacity: 1,
    sunIntensity: 0,
    sunAngle: 0.8,
    raySpread: 1,
    rayTwinkle: 0,
    rayTwinkleSpeed: 1,
  },
  snow: {
    density: 80,
    speed: 0.3,
    windDirection: 0,
    windStrength: 0.2,
    maxDrops: 60,
    scale: 2,
    height: 0.5,
    opacity: 1,
    sunIntensity: 0,
    sunAngle: 0.8,
    raySpread: 1,
    rayTwinkle: 0,
    rayTwinkleSpeed: 1,
  },
  fog: {
    density: 0.55,
    speed: 0.2,
    windDirection: 0,
    windStrength: 0.2,
    maxDrops: 80,
    scale: 2,
    height: 0.6,
    opacity: 0.7,
    sunIntensity: 0,
    sunAngle: 0.9,
    raySpread: 1,
    rayTwinkle: 0,
    rayTwinkleSpeed: 1,
  },
  cloud: {
    density: 0.35,
    speed: 0.12,
    windDirection: 0,
    windStrength: 0.1,
    maxDrops: 80,
    scale: 1.4,
    height: 0.8,
    opacity: 0.5,
    sunIntensity: 0.6,
    sunAngle: 0.85,
    raySpread: 0.95,
    rayTwinkle: 0.35,
    rayTwinkleSpeed: 0.95,
  },
};

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

export const isWeatherEffect = (value: unknown): value is WeatherEffect => {
  return typeof value === 'string' && (WEATHER_EFFECTS as readonly string[]).includes(value);
};

export const isWeatherPresetName = (value: unknown): value is WeatherPresetName => {
  return typeof value === 'string' && (WEATHER_PRESET_NAMES as readonly string[]).includes(value);
};

export const isWeatherPresetForEffect = (
  preset: unknown,
  effect: WeatherEffect
): preset is WeatherPresetName => {
  return isWeatherPresetName(preset) && WEATHER_PRESETS[preset].effect === effect;
};

const extractPresetParams = (preset: WeatherPresetName): WeatherParams => {
  const source = WEATHER_PRESETS[preset] as Record<string, unknown>;
  return {
    density: typeof source['density'] === 'number' ? source['density'] : undefined,
    speed: typeof source['speed'] === 'number' ? source['speed'] : undefined,
    windDirection: typeof source['windDirection'] === 'number' ? source['windDirection'] : undefined,
    windStrength: typeof source['windStrength'] === 'number' ? source['windStrength'] : undefined,
    maxDrops: typeof source['maxDrops'] === 'number' ? source['maxDrops'] : undefined,
    scale: typeof source['scale'] === 'number' ? source['scale'] : undefined,
    height: typeof source['height'] === 'number' ? source['height'] : undefined,
    opacity: typeof source['opacity'] === 'number' ? source['opacity'] : undefined,
    sunIntensity: typeof source['sunIntensity'] === 'number' ? source['sunIntensity'] : undefined,
    sunAngle: typeof source['sunAngle'] === 'number' ? source['sunAngle'] : undefined,
    raySpread: typeof source['raySpread'] === 'number' ? source['raySpread'] : undefined,
    rayTwinkle: typeof source['rayTwinkle'] === 'number' ? source['rayTwinkle'] : undefined,
    rayTwinkleSpeed: typeof source['rayTwinkleSpeed'] === 'number' ? source['rayTwinkleSpeed'] : undefined,
  };
};

export const cloneWeatherState = (state: WeatherState | null): WeatherState | null => {
  if (!state) {
    return null;
  }
  return {
    effect: state.effect,
    preset: state.preset,
    transitionMs: state.transitionMs,
    startedAt: state.startedAt,
    params: state.params ? { ...state.params } : undefined,
  };
};

export const normalizeTransitionMs = (value: unknown): number => {
  if (typeof value !== 'number') {
    return DEFAULT_TRANSITION_MS;
  }
  return Math.round(clamp(value, 0, 60_000));
};

export const normalizeWeatherParams = (
  effect: WeatherEffect,
  params: unknown
): WeatherParams => {
  const defaults = DEFAULT_WEATHER_PARAMS[effect];
  const candidate = (params && typeof params === 'object') ? (params as Record<string, unknown>) : {};

  const densityRange = effect === 'rain' || effect === 'snow' ? [1, 500] as const : [0, 1.5] as const;
  const maxDropsRange = effect === 'rain' || effect === 'snow' ? [1, 1_000] as const : [1, 500] as const;

  return {
    density: clamp(typeof candidate['density'] === 'number' ? candidate['density'] : defaults.density, densityRange[0], densityRange[1]),
    speed: clamp(typeof candidate['speed'] === 'number' ? candidate['speed'] : defaults.speed, 0, 5),
    windDirection: clamp(typeof candidate['windDirection'] === 'number' ? candidate['windDirection'] : defaults.windDirection, -360, 360),
    windStrength: clamp(typeof candidate['windStrength'] === 'number' ? candidate['windStrength'] : defaults.windStrength, 0, 5),
    maxDrops: Math.round(clamp(typeof candidate['maxDrops'] === 'number' ? candidate['maxDrops'] : defaults.maxDrops, maxDropsRange[0], maxDropsRange[1])),
    scale: clamp(typeof candidate['scale'] === 'number' ? candidate['scale'] : defaults.scale, 0.1, 6),
    height: clamp(typeof candidate['height'] === 'number' ? candidate['height'] : defaults.height, 0, 1),
    opacity: clamp(typeof candidate['opacity'] === 'number' ? candidate['opacity'] : defaults.opacity, 0, 1),
    sunIntensity: clamp(typeof candidate['sunIntensity'] === 'number' ? candidate['sunIntensity'] : defaults.sunIntensity, 0, 1),
    sunAngle: clamp(typeof candidate['sunAngle'] === 'number' ? candidate['sunAngle'] : defaults.sunAngle, 0, 2),
    raySpread: clamp(typeof candidate['raySpread'] === 'number' ? candidate['raySpread'] : defaults.raySpread, 0.2, 2),
    rayTwinkle: clamp(typeof candidate['rayTwinkle'] === 'number' ? candidate['rayTwinkle'] : defaults.rayTwinkle, 0, 1),
    rayTwinkleSpeed: clamp(typeof candidate['rayTwinkleSpeed'] === 'number' ? candidate['rayTwinkleSpeed'] : defaults.rayTwinkleSpeed, 0, 3),
  };
};

export const normalizeWeatherState = (
  value: unknown,
  now: number = Date.now()
): WeatherState | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Record<string, unknown>;
  const rawPreset = source['preset'];
  const presetDefinition = isWeatherPresetName(rawPreset) ? WEATHER_PRESETS[rawPreset] : null;
  const sourceEffect = isWeatherEffect(source['effect']) ? source['effect'] : undefined;
  const effect = sourceEffect ?? presetDefinition?.effect;
  if (!isWeatherEffect(effect)) {
    return null;
  }
  const preset = rawPreset === 'custom'
    ? 'custom'
    : isWeatherPresetForEffect(rawPreset, effect)
      ? rawPreset
      : undefined;

  const presetParams = isWeatherPresetName(preset) ? extractPresetParams(preset) : {};
  const sourceParams =
    source['params'] && typeof source['params'] === 'object'
      ? (source['params'] as Record<string, unknown>)
      : {};

  const startedAt =
    typeof source['startedAt'] === 'number' && Number.isFinite(source['startedAt']) && source['startedAt'] > 0
      ? Math.round(source['startedAt'])
      : now;

  return {
    effect,
    preset,
    params: normalizeWeatherParams(effect, { ...presetParams, ...sourceParams }),
    transitionMs: normalizeTransitionMs(source['transitionMs']),
    startedAt,
  };
};

export const mergeWeatherState = (
  current: WeatherState | null,
  patch: WeatherStatePatch,
  now: number = Date.now()
): WeatherState | null => {
  if (!patch || typeof patch !== 'object') {
    return current ? cloneWeatherState(current) : null;
  }

  const nextPreset = patch.preset ?? current?.preset;
  const presetDefinition = isWeatherPresetName(nextPreset) ? WEATHER_PRESETS[nextPreset] : null;
  const presetChanged = typeof patch.preset !== 'undefined' && patch.preset !== current?.preset;
  const nextEffect = patch.effect ?? presetDefinition?.effect ?? current?.effect;
  if (!nextEffect || !isWeatherEffect(nextEffect)) {
    return current ? cloneWeatherState(current) : null;
  }
  const preset = nextPreset === 'custom'
    ? 'custom'
    : isWeatherPresetForEffect(nextPreset, nextEffect)
      ? nextPreset
      : undefined;

  const baseParams = presetChanged && isWeatherPresetName(preset)
    ? extractPresetParams(preset)
    : { ...(isWeatherPresetName(preset) ? extractPresetParams(preset) : {}), ...(current?.params ?? {}) };

  const mergedParams = {
    ...baseParams,
    ...(patch.params ?? {}),
  };

  return {
    effect: nextEffect,
    preset,
    params: normalizeWeatherParams(nextEffect, mergedParams),
    transitionMs: normalizeTransitionMs(patch.transitionMs ?? current?.transitionMs),
    startedAt:
      typeof patch.startedAt === 'number' && Number.isFinite(patch.startedAt) && patch.startedAt > 0
        ? Math.round(patch.startedAt)
        : now,
  };
};

const weatherParamsEqual = (
  a: WeatherParams | undefined,
  b: WeatherParams | undefined
): boolean => {
  return (
    (a?.density ?? undefined) === (b?.density ?? undefined) &&
    (a?.speed ?? undefined) === (b?.speed ?? undefined) &&
    (a?.windDirection ?? undefined) === (b?.windDirection ?? undefined) &&
    (a?.windStrength ?? undefined) === (b?.windStrength ?? undefined) &&
    (a?.maxDrops ?? undefined) === (b?.maxDrops ?? undefined) &&
    (a?.scale ?? undefined) === (b?.scale ?? undefined) &&
    (a?.height ?? undefined) === (b?.height ?? undefined) &&
    (a?.opacity ?? undefined) === (b?.opacity ?? undefined) &&
    (a?.sunIntensity ?? undefined) === (b?.sunIntensity ?? undefined) &&
    (a?.sunAngle ?? undefined) === (b?.sunAngle ?? undefined) &&
    (a?.raySpread ?? undefined) === (b?.raySpread ?? undefined) &&
    (a?.rayTwinkle ?? undefined) === (b?.rayTwinkle ?? undefined) &&
    (a?.rayTwinkleSpeed ?? undefined) === (b?.rayTwinkleSpeed ?? undefined)
  );
};

export const areWeatherStatesEqual = (
  a: WeatherState | null,
  b: WeatherState | null
): boolean => {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }

  return (
    a.effect === b.effect &&
    (a.preset ?? undefined) === (b.preset ?? undefined) &&
    (a.transitionMs ?? DEFAULT_TRANSITION_MS) === (b.transitionMs ?? DEFAULT_TRANSITION_MS) &&
    (a.startedAt ?? 0) === (b.startedAt ?? 0) &&
    weatherParamsEqual(a.params, b.params)
  );
};

export const resolveEffectiveWeather = (
  weatherState: WeatherState | null,
  localWeatherOverride: WeatherState | null
): WeatherState | null => {
  return localWeatherOverride ? cloneWeatherState(localWeatherOverride) : cloneWeatherState(weatherState);
};

export const toCanvasWeatherEffect = (effect: WeatherEffect): CanvasWeatherEffect => {
  return effect;
};

export const toCanvasWeatherOptions = (weatherState: WeatherState): CanvasWeatherOptions => {
  const normalized = normalizeWeatherState(weatherState);
  if (!normalized) {
    const fallback = normalizeWeatherState({ effect: 'rain' }) as WeatherState;
    return {
      effect: 'rain',
      density: fallback.params?.density ?? DEFAULT_WEATHER_PARAMS.rain.density,
      speed: fallback.params?.speed ?? DEFAULT_WEATHER_PARAMS.rain.speed,
      windDirection: fallback.params?.windDirection ?? DEFAULT_WEATHER_PARAMS.rain.windDirection,
      windStrength: fallback.params?.windStrength ?? DEFAULT_WEATHER_PARAMS.rain.windStrength,
      maxDrops: fallback.params?.maxDrops ?? DEFAULT_WEATHER_PARAMS.rain.maxDrops,
      scale: fallback.params?.scale ?? DEFAULT_WEATHER_PARAMS.rain.scale,
      height: fallback.params?.height ?? DEFAULT_WEATHER_PARAMS.rain.height,
      sunIntensity: fallback.params?.sunIntensity ?? DEFAULT_WEATHER_PARAMS.rain.sunIntensity,
      sunAngle: fallback.params?.sunAngle ?? DEFAULT_WEATHER_PARAMS.rain.sunAngle,
      raySpread: fallback.params?.raySpread ?? DEFAULT_WEATHER_PARAMS.rain.raySpread,
      rayTwinkle: fallback.params?.rayTwinkle ?? DEFAULT_WEATHER_PARAMS.rain.rayTwinkle,
      rayTwinkleSpeed: fallback.params?.rayTwinkleSpeed ?? DEFAULT_WEATHER_PARAMS.rain.rayTwinkleSpeed,
      alpha: fallback.params?.opacity ?? DEFAULT_WEATHER_PARAMS.rain.opacity,
      zIndex: 1000,
    };
  }

  return {
    effect: toCanvasWeatherEffect(normalized.effect),
    density: normalized.params?.density ?? DEFAULT_WEATHER_PARAMS[normalized.effect].density,
    speed: normalized.params?.speed ?? DEFAULT_WEATHER_PARAMS[normalized.effect].speed,
    windDirection: normalized.params?.windDirection ?? DEFAULT_WEATHER_PARAMS[normalized.effect].windDirection,
    windStrength: normalized.params?.windStrength ?? DEFAULT_WEATHER_PARAMS[normalized.effect].windStrength,
    maxDrops: normalized.params?.maxDrops ?? DEFAULT_WEATHER_PARAMS[normalized.effect].maxDrops,
    scale: normalized.params?.scale ?? DEFAULT_WEATHER_PARAMS[normalized.effect].scale,
    height: normalized.params?.height ?? DEFAULT_WEATHER_PARAMS[normalized.effect].height,
    sunIntensity: normalized.params?.sunIntensity ?? DEFAULT_WEATHER_PARAMS[normalized.effect].sunIntensity,
    sunAngle: normalized.params?.sunAngle ?? DEFAULT_WEATHER_PARAMS[normalized.effect].sunAngle,
    raySpread: normalized.params?.raySpread ?? DEFAULT_WEATHER_PARAMS[normalized.effect].raySpread,
    rayTwinkle: normalized.params?.rayTwinkle ?? DEFAULT_WEATHER_PARAMS[normalized.effect].rayTwinkle,
    rayTwinkleSpeed: normalized.params?.rayTwinkleSpeed ?? DEFAULT_WEATHER_PARAMS[normalized.effect].rayTwinkleSpeed,
    alpha: normalized.params?.opacity ?? DEFAULT_WEATHER_PARAMS[normalized.effect].opacity,
    zIndex: 1000,
  };
};
