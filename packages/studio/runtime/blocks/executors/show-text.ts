import { excludeTriggers } from '../context-helpers';
import type {
  GameExecutionContext,
  BlockExecutor,
  ShowTextParams
} from '../types';
import { getEvent } from './utils';

export const schemaShowText = {
  type: 'show_text',
  label: 'Show Text',
  description: 'Display a message dialog to the player',
  category: 'message',
  icon: '💬',
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {
      text: { 
        type: 'string', 
        title: 'Message Text',
        description: 'The text to display in the dialog',
        format: 'textarea'
      },
      speaker: { 
        type: 'string', 
        title: 'Speaker Name',
        description: 'Name of the character speaking (optional)',
        $ref: '#/functions/event'
      },
      faceset: {
        type: 'string',
        title: 'Faceset',
        description: 'Select the faceset and expression to display',
        format: {
          name: 'faceset-expression'
        }
      },
      position: {
        type: 'string',
        title: 'Dialog Position',
        enum: ['top', 'middle', 'bottom'],
        default: 'bottom'
      }
    },
    required: ['text']
  }
} as const;

/**
 * Displays a text message dialog to the player
 * 
 * This executor handles showing text dialogs with optional speaker information
 * and position configuration. It supports both simple text messages and
 * dialog boxes with character names.
 * 
 * @param context - The execution context containing player and event references
 * @param params - Parameters containing the text message and optional configuration
 * 
 * @example
 * ```typescript
 * await showTextExecutor(context, {
 *   text: 'Hello, adventurer!',
 *   speaker: 'npc_001',
 *   position: 'bottom'
 * });
 * ```
 */
export const show_text: BlockExecutor<'show_text'> = async (context, params) => {
    await context.player.showText(params.text, {
      talkWith: getEvent(context, { eventId: params.speaker }),
      position: params.position,
      face: params.faceset
    });
};
