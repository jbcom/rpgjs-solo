import type { BlockExecutor } from '../types';
import { setWeatherOnMap } from './weather-map';
import { weatherSetBlockSchema } from '../../schemas/weather';

export const schemaSetWeather = {
  type: 'set_weather',
  label: 'Set Weather',
  description: 'Replace current map weather state and sync to players by default',
  category: 'scene',
  icon: '🌦️',
  requiredCapabilities: ['map'],
  schema: {
    ...weatherSetBlockSchema,
    properties: {
      ...weatherSetBlockSchema.properties,
      // sync: {
      //   type: 'boolean',
      //   title: 'Sync to players',
      //   description: 'Disable to keep the mutation server-only',
      //   default: true,
      // },
    },
  },
} as const;

export const set_weather: BlockExecutor<'set_weather'> = async (context, params) => {
  setWeatherOnMap(
    context,
    {
      effect: params.effect,
      preset: params.preset,
      params: params.params,
      transitionMs: params.transitionMs,
    },
    params.sync
  );
};
