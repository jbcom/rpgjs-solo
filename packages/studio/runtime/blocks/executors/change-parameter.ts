import { excludeTriggers } from '../context-helpers';
import { createVariableModificationSchema, OPERATION_SETS } from '../definitions';
import type { BlockExecutor } from '../types';
import { getValue } from './utils';

const modificationSchema = createVariableModificationSchema(
  OPERATION_SETS.ADDITIVE,
  'Value',
  'Constant parameter value to modify',
  'Value Variable',
  'Variable containing the parameter value to use'
);

export const schemaChangeParameter = {
  type: 'change_parameter',
  label: 'Change Parameter',
  description: 'Modify a player parameter value',
  category: 'character',
  icon: '🧩',
  requiredCapabilities: ['player'],
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {
      parameterId: {
        type: 'string',
        title: 'Parameter',
        enum: ['maxHp', 'maxSp', 'str', 'agi', 'int', 'dex'],
        format: {
          labels: ['Max HP', 'Max SP', 'STR', 'AGI', 'INT', 'DEX']
        },
        default: 'maxHp'
      },
      ...modificationSchema.properties
    },
    allOf: modificationSchema.allOf
  }
} as const;

export const change_parameter: BlockExecutor<'change_parameter'> = async (context, params) => {
  const amount = Math.floor(getValue(context, params));
  const parameterId = params.parameterId;
  const currentModifiers = (context.player as any)._paramsModifier ?? {};
  const currentValue = currentModifiers[parameterId]?.value ?? 0;

  let nextValue = currentValue;
  switch (params.operation) {
    case 'set':
      nextValue = amount;
      break;
    case 'add':
      nextValue = currentValue + amount;
      break;
    case 'sub':
      nextValue = currentValue - amount;
      break;
  }

  context.player.paramsModifier = {
    ...currentModifiers,
    [parameterId]: {
      ...currentModifiers[parameterId],
      value: nextValue
    }
  };
};
