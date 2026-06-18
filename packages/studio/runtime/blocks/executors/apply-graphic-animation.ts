import type {
  BlockExecutor,
  ApplyGraphicAnimationParams,
  BlockDefinition
} from '../types';
import { getEvent } from './utils';

export const schemaApplyGraphicAnimation: BlockDefinition<'apply_graphic_animation'> = {
  type: 'apply_graphic_animation',
  label: 'Apply Graphic Animation',
  description: 'Change the animation state of a character or event',
  category: 'character',
  icon: '🎞️',
  requiredCapabilities: ['map'],
  schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        title: 'Target',
        description: 'Select the player or an event to animate',
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
        title: 'Animation',
        description: 'Animation to apply (e.g., walk, attack, stand)',
        format: {
          name: 'media',
          type: 'animation'
        }
      },
      repeatType: {
        type: 'string',
        title: 'Repeat',
        enum: ['infinite', 'count'],
        default: 'infinite',
        format: {
          radio: true,
          horizontal: true,
          labels: ['Infinite', 'Count']
        }
      }
    },
    allOf: [
      {
        if: {
          properties: {
            repeatType: { const: 'count' }
          }
        },
        then: {
          properties: {
            repeatCount: {
              type: 'number',
              title: 'Repeat Count',
              description: 'Number of times to play the animation',
              minimum: 1,
              default: 1
            }
          },
          required: ['repeatCount']
        }
      }
    ],
    required: ['eventId', 'animation', 'repeatType']
  }
};

/**
 * Applies an animation state to a character or event
 * 
 * This executor updates the current animation of the target and optionally
 * plays it a limited number of times. When repeatType is "infinite", the
 * animation is applied continuously until changed again.
 */
export const apply_graphic_animation: BlockExecutor<'apply_graphic_animation'> = async (context, params) => {
  const target = getEvent(context, { eventId: params.eventId });
  if (!target) return
  await (target as any).setGraphicAnimation('default', params.spritesheet, params.repeatType === 'count' ? params.repeatCount : Infinity);
};
