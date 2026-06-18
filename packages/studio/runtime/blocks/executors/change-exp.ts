import { excludeTriggers } from '../context-helpers';
import { createVariableModificationSchema, OPERATION_SETS } from '../definitions';
import type { BlockExecutor } from '../types';
import { getValue } from './utils';

export const schemaChangeExp = {
  type: 'change_exp',
  label: 'Change Experience',
  description: 'Modify the player\'s experience points',
  category: 'character',
  icon: '📈',
  requiredCapabilities: ['player'],
  contextCondition: excludeTriggers('onInit'),
  schema: createVariableModificationSchema(
    OPERATION_SETS.ADDITIVE,
    'Value',
    'Constant experience value to modify',
    'Value Variable',
    'Variable containing the experience value to use'
  )
} as const;

export const change_exp: BlockExecutor<'change_exp'> = async (context, params) => {
  const amount = Math.floor(getValue(context, params));

  switch (params.operation) {
    case 'set':
      context.player.exp = Math.max(0, amount);
      break;
    case 'add':
      context.player.exp = Math.max(0, context.player.exp + amount);
      break;
    case 'sub':
      context.player.exp = Math.max(0, context.player.exp - amount);
      break;
  }
};
