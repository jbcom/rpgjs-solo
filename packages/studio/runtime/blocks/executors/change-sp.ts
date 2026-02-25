import { excludeTriggers } from '../context-helpers';
import { createVariableModificationSchema, OPERATION_SETS } from '../definitions';
import type { BlockExecutor } from '../types';
import { getValue } from './utils';

export const schemaChangeSp = {
  type: 'change_sp',
  label: 'Change SP',
  description: 'Modify the player\'s SP',
  category: 'character',
  icon: '💠',
  contextCondition: excludeTriggers('onInit'),
  schema: createVariableModificationSchema(
    OPERATION_SETS.HEALTH,
    'Value',
    'Constant SP value to modify',
    'Value Variable',
    'Variable containing the SP value to use'
  )
} as const;

export const change_sp: BlockExecutor<'change_sp'> = async (context, params) => {
  const amount = Math.floor(getValue(context, params));

  switch (params.operation) {
    case 'set':
      context.player.sp = amount;
      break;
    case 'add':
      context.player.sp = context.player.sp + amount;
      break;
    case 'sub':
      context.player.sp = context.player.sp - amount;
      break;
  }
};
