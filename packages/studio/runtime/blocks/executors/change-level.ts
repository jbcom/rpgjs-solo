import { excludeTriggers } from '../context-helpers';
import { createVariableModificationSchema, OPERATION_SETS } from '../definitions';
import type { BlockExecutor } from '../types';
import { getValue } from './utils';

export const schemaChangeLevel = {
  type: 'change_level',
  label: 'Change Level',
  description: 'Modify the player\'s level',
  category: 'character',
  icon: '⭐',
  contextCondition: excludeTriggers('onInit'),
  schema: createVariableModificationSchema(
    OPERATION_SETS.ADDITIVE,
    'Value',
    'Constant level value to modify',
    'Value Variable',
    'Variable containing the level value to use'
  )
} as const;

export const change_level: BlockExecutor<'change_level'> = async (context, params) => {
  const amount = Math.floor(getValue(context, params));

  switch (params.operation) {
    case 'set':
      context.player.level = amount;
      break;
    case 'add':
      context.player.level += amount;
      break;
    case 'sub':
      context.player.level -= amount;
      break;
  }
};
