import type {
  BlockExecutor,
  BlockDefinition
} from '../types';
import { resolveVariablesInText } from '../resolve-text';


export const schemaShowUpAnimation: BlockDefinition<'show_up_animation'> = {
  type: 'show_up_animation',
  label: 'Show Up Animation',
  description: 'Display an up animation above the player',
  category: 'character',
  icon: '⬆️',
  schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        title: 'Text',
        description: 'Text to display (supports {variables})'
      },
      icon: {
        type: 'string',
        title: 'Icon',
        description: 'Optional icon to display before the text',
        format: {
          name: "media",
          type: "icon",
          buttonLabel: "Select Icon",
          useUpload: {
            accept: "image/*",
          },
        },
      },
      sound: {
        type: 'string',
        title: 'Sound',
        description: 'Optional sound effect to play',
        format: {
          name: "media",
          type: "sound",
          buttonLabel: "Select Sound Effect",
          useUpload: {
            accept: "audio/*",
          },
        },
      }
    },
    required: ['text']
  }
};

export const show_up_animation: BlockExecutor<'show_up_animation'> = async (context, params) => {
  await context.player.showComponentAnimation?.('up', {
    text: resolveVariablesInText(params.text, context.player),
    icon: params.icon
  });
};
