import type { GameExecutionContext } from '../types';
import {
  areWeatherStatesEqual,
  cloneWeatherState,
  mergeWeatherState,
  normalizeWeatherState,
  type WeatherStatePatch,
} from '../../weather';

type RuntimeMapWeatherApi = {
  getWeather?: () => unknown;
  setWeather?: (next: unknown, options?: { sync?: boolean }) => unknown;
  clearWeather?: (options?: { sync?: boolean }) => unknown;
};

const resolveCurrentMap = (context: GameExecutionContext): RuntimeMapWeatherApi | null => {
  if ((context as any).map) {
    return (context as any).map as RuntimeMapWeatherApi;
  }
  if (typeof (context.event as any)?.getCurrentMap === 'function') {
    return (context.event as any).getCurrentMap() as RuntimeMapWeatherApi;
  }
  if (typeof (context.player as any)?.getCurrentMap === 'function') {
    return (context.player as any).getCurrentMap() as RuntimeMapWeatherApi;
  }
  return null;
};

export const setWeatherOnMap = (
  context: GameExecutionContext,
  payload: unknown,
  sync?: boolean
): boolean => {
  const map = resolveCurrentMap(context);
  if (!map || typeof map.setWeather !== 'function') {
    return false;
  }

  const next = normalizeWeatherState(payload);
  if (!next) {
    return false;
  }

  const current =
    typeof map.getWeather === 'function' ? normalizeWeatherState(map.getWeather()) : null;

  if (areWeatherStatesEqual(current, next)) {
    return false;
  }

  map.setWeather(cloneWeatherState(next), { sync });
  return true;
};

export const patchWeatherOnMap = (
  context: GameExecutionContext,
  patch: WeatherStatePatch,
  sync?: boolean
): boolean => {
  const map = resolveCurrentMap(context);
  if (!map || typeof map.setWeather !== 'function') {
    return false;
  }

  const current =
    typeof map.getWeather === 'function' ? normalizeWeatherState(map.getWeather()) : null;
  const next = mergeWeatherState(current, patch);

  if (!next || areWeatherStatesEqual(current, next)) {
    return false;
  }

  map.setWeather(cloneWeatherState(next), { sync });
  return true;
};

export const clearWeatherOnMap = (
  context: GameExecutionContext,
  sync?: boolean
): boolean => {
  const map = resolveCurrentMap(context);
  if (!map || typeof map.clearWeather !== 'function') {
    return false;
  }

  const current =
    typeof map.getWeather === 'function' ? normalizeWeatherState(map.getWeather()) : null;
  if (!current) {
    return false;
  }

  map.clearWeather({ sync });
  return true;
};
