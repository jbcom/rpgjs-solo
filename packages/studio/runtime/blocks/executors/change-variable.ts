import type {
  GameExecutionContext,
  BlockExecutor,
  ChangeVariableParams
} from '../types';
import { createVariableModificationSchema, OPERATION_SETS } from '../definitions';

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

/**
 * Modifies a variable value
 * 
 * This executor handles changing variable values with various operations.
 * It supports both constant amounts and variable-based amounts, allowing
 * for flexible variable manipulation in the game.
 * 
 * @param context - The execution context
 * @param params - Parameters containing variable ID, operation, and value source
 * 
 * @example
 * ```typescript
 * // Add 10 to a variable
 * await changeVariableExecutor(context, {
 *   variableId: 'player_score',
 *   type: 'constant',
 *   operation: 'add',
 *   amount: 10
 * });
 * 
 * // Multiply variable by another variable
 * await changeVariableExecutor(context, {
 *   variableId: 'player_score',
 *   type: 'variable',
 *   operation: 'mul',
 *   amountVariableId: 'multiplier'
 * });
 * ```
 */
export const change_variable: BlockExecutor<'change_variable'> = async (context, params) => {
  const value = params.type === 'constant'
    ? (params.amount ?? 0)
    : (() => {
        const v = context.getVariable(params.amountVariableId ?? '');
        return typeof v === 'number' ? v : 0;
      })();
  
  const variableId = params.variableId;
  const currentValue = context.getVariable(variableId);
  const numericCurrentValue = typeof currentValue === 'number' ? currentValue : 0;
  
  switch (params.operation) {
    case 'set':
      context.setVariable(variableId, value);
      break;
    case 'add':
      context.setVariable(variableId, numericCurrentValue + value);
      break;
    case 'sub':
      context.setVariable(variableId, numericCurrentValue - value);
      break;
    case 'mul':
      context.setVariable(variableId, numericCurrentValue * value);
      break;
    case 'div':
      context.setVariable(variableId, Math.floor(numericCurrentValue / value));
      break;
    case 'mod':
      context.setVariable(variableId, numericCurrentValue % value);
      break;
  }
};
