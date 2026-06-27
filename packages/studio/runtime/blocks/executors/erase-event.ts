import { excludeTriggers } from '../context-helpers';
import type { BlockExecutor, EraseEventParams } from '../types';
import { getEvent } from './utils';

const DEFAULT_ERASE_ANIMATION_DURATION = 1200;

export const schemaEraseEvent = {
  type: 'erase_event',
  label: 'Erase Event',
  description: 'Remove an event from the map',
  category: 'scene',
  icon: '🧹',
  requiredCapabilities: ['player', 'map'],
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        title: 'Event',
        format: {
          name: 'map-position',
          displayMode: 'single-map',
          selectionMode: 'event',
          returnType: 'eventId',
          player: false
        }
      },
      animation: {
        type: 'string',
        title: 'Animation',
        description: 'Optional animation to play before erasing',
        format: {
          name: 'media',
          type: 'animation'
        }
      }
    },
    required: ['eventId']
  }
} as const;

export const erase_event: BlockExecutor<'erase_event'> = async (context, params) => {
  const character = getEvent(context, params);
  if (!character) {
    return;
  }

  if (params.animation) {
    (character as any).remove?.({
      reason: 'erase_event',
      transition: {
        animation: 'default',
        graphic: params.animation,
        duration: DEFAULT_ERASE_ANIMATION_DURATION,
      },
      timeoutMs: DEFAULT_ERASE_ANIMATION_DURATION,
    });
    return;
  }

  (character as any).remove?.();
};
