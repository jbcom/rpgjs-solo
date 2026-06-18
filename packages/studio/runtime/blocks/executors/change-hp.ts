import { excludeTriggers } from '../context-helpers';
import { createVariableModificationSchema, OPERATION_SETS } from '../definitions';
import type { BlockExecutor } from '../types';
import { getValue } from './utils';

export const schemaChangeHp = {
  type: 'change_hp',
  label: 'Change HP',
  description: 'Modify the player\'s HP',
  category: 'character',
  icon: '❤️',
  requiredCapabilities: ['player'],
  contextCondition: excludeTriggers('onInit'),
  schema: createVariableModificationSchema(
    OPERATION_SETS.HEALTH,
    'Value',
    'Constant HP value to modify',
    'Value Variable',
    'Variable containing the HP value to use'
  )
} as const;

export const change_hp: BlockExecutor<'change_hp'> = async (context, params) => {
  const amount = Math.floor(getValue(context, params));

  switch (params.operation) {
    case 'set':
      context.player.hp = amount;
      break;
    case 'add':
      context.player.hp = context.player.hp + amount;
      break;
    case 'sub':
      context.player.hp = context.player.hp - amount;
      break;
  }
};
