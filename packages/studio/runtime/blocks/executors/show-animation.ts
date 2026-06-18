import type {
  BlockExecutor,
  ShowAnimationParams,
  BlockDefinition
} from '../types';
import { getEvent } from './utils';

export const schemaShowAnimation: BlockDefinition<'show_animation'> = {
  type: 'show_animation',
  label: 'Show Animation',
  description: 'Display a visual animation on the map or an event',
  category: 'scene',
  icon: '✨',
  requiredCapabilities: ['player', 'map'],
  schema: {
    type: 'object',
    properties: {
      targetType: {
        type: 'string',
        title: 'Target',
        enum: ['position', 'event'],
        default: 'position',
        format: {
          radio: true,
          horizontal: true,
          labels: ['Map Position', 'Event']
        }
      },
      position: {
        type: 'object',
        title: 'Position',
        description: 'Select a position on the current map',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' }
        },
        format: {
          name: 'map-position',
          displayMode: 'single-map',
          selectionMode: 'position',
          returnType: 'position'
        }
      },
      eventId: {
        type: 'string',
        title: 'Event',
        description: 'Select an event to attach the animation to',
        format: {
          name: 'map-position',
          displayMode: 'single-map',
          selectionMode: 'event',
          returnType: 'eventId',
          player: true
        }
      },
      spritesheet: {
        type: 'string',
        title: 'Spritesheet',
        description: 'Spritesheet ID to use for the animation',
        format: {
          name: 'media',
          type: 'animation'
        }
      }
    },
    allOf: [
      {
        if: {
          properties: {
            targetType: { const: 'event' }
          }
        },
        then: {
          required: ['eventId']
        },
        else: {
          required: ['position']
        }
      }
    ],
    required: ['targetType', 'graphic']
  }
};

/**
 * Displays a spritesheet animation on the map or attached to an event
 * 
 * If the target is an event and the engine exposes a direct showAnimation
 * method on events, it will be used. Otherwise, the animation is displayed
 * at the event's current position as a fallback.
 */
export const show_animation: BlockExecutor<'show_animation'> = async (context, params) => {
  const map = context.player.getCurrentMap?.();
  if (!map) {
    return;
  }

  const graphic = params.spritesheet;
  const animationName = 'default';

  let target = params.targetType === 'event' ? getEvent(context, { eventId: params.eventId }) : params.position;

  await map.showAnimation?.(target, graphic, animationName);
};
