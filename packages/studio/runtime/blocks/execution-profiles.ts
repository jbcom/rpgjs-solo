import type { EventBuilderExecutionProfile } from './types';

export const eventBuilderProfiles = {
  eventPage: {
    source: 'event_page',
    capabilities: [
      'map',
      'player',
      'event',
      'variables',
      'inventory',
      'equipment',
      'skills',
      'ui',
      'audio',
    ],
  },
  mapLoad: {
    source: 'map_load',
    capabilities: [
      'map',
      'player',
      'variables',
      'inventory',
      'equipment',
      'skills',
      'ui',
      'audio',
    ],
    fields: {
      excludeTargets: ['this_event'],
      excludeConditionTypes: ['self_switch'],
    },
  },
} satisfies Record<string, EventBuilderExecutionProfile>;
