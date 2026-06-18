import { excludeTriggers } from '../context-helpers';
import type { BlockExecutor, ShowSaveParams } from '../types';

export const schemaShowSave = {
  type: 'show_save',
  label: 'Show Save Menu',
  description: 'Open the save menu with optional slots',
  category: 'scene',
  icon: '💾',
  requiredCapabilities: ['player', 'ui'],
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {

    }
  }
} as const;

export const show_save: BlockExecutor<'show_save'> = async (context, params) => {
  await context.player.showSave(params.slots ?? [], params.options ?? {});
};
