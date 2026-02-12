export type WeatherEffect = "rain" | "snow" | "fog" | "cloud";

export interface WeatherParams {
  speed?: number;
  windDirection?: number;
  windStrength?: number;
  density?: number;
  maxDrops?: number;
  height?: number;
  scale?: number;
  sunIntensity?: number;
  sunAngle?: number;
  raySpread?: number;
  rayTwinkle?: number;
  rayTwinkleSpeed?: number;
  zIndex?: number;
  alpha?: number;
  blendMode?: string;
}

export interface WeatherState {
  effect: WeatherEffect;
  preset?: string;
  params?: WeatherParams;
  transitionMs?: number;
  durationMs?: number;
  startedAt?: number;
  seed?: number;
}
