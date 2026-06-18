import { excludeTriggers } from '../context-helpers';
import type { BlockExecutor, CallGameoverParams } from '../types';

export const schemaCallGameover = {
  type: 'call_gameover',
  label: 'Call Gameover',
  description: 'Open the game over screen',
  category: 'scene',
  icon: '☠️',
  requiredCapabilities: ['player', 'ui'],
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        title: 'Title'
      },
      subtitle: {
        type: 'string',
        title: 'Subtitle'
      }
    }
  }
} as const;

export const call_gameover: BlockExecutor<'call_gameover'> = async (context, params) => {
  await context.player.callGameover({
    title: params.title,
    subtitle: params.subtitle
  });
};
