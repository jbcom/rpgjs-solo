import type {
  BlockExecutor,
  ChangeVariableParams,
  SetVariableParams,
  VariableOperation
} from '../types';
import { createVariableModificationSchema, OPERATION_SETS } from '../definitions';
import { set_variable } from './set-variable';

export const schemaChangeVariable = {
  type: 'change_variable',
  label: 'Change Variable',
  description: 'Modify a variable value',
  category: 'variable',
  icon: '📊',
  requiredCapabilities: ['variables'],
  schema: createVariableModificationSchema(
    OPERATION_SETS.ALL,
    'Value',
    'Constant value to assign or modify',
    'Value Variable',
    'Variable containing the value to use'
  )
} as const;

const legacyOperationMap: Record<ChangeVariableParams['operation'], VariableOperation> = {
  set: 'set',
  add: 'add',
  sub: 'subtract',
  mul: 'multiply',
  div: 'divide',
  mod: 'modulo'
};

/**
 * Legacy alias kept for old projects. New block payloads should use set_variable.
 */
export const change_variable: BlockExecutor<'change_variable'> = async (context, params) => {
  const nextParams: SetVariableParams = {
    variableId: params.variableId,
    operation: legacyOperationMap[params.operation],
    valueSource: params.type === 'variable' ? 'variable' : 'constant',
    value: params.amount ?? 0,
    sourceVariableId: params.amountVariableId
  };

  await set_variable(context, nextParams);
};
