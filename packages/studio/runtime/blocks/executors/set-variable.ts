import type {
  GameExecutionContext,
  BlockExecutor,
  SetVariableParams
} from '../types';
import { variableSchema } from '@common/schemas/database';

export const schemaSetVariable = {
  type: 'set_variable',
  label: 'Set Variable',
  description: 'Set the value of a game variable',
  category: 'variable',
  icon: '📝',
  schema: {
    type: 'object',
    properties: {
      variableId: {
        type: 'string',
        title: 'Variable',
        description: 'Select a variable from the database',
        $ref: '#/functions/variable',
        format: {
          add: {
            schema: variableSchema
          }
        }
      },
      operation: {
        type: 'string',
        title: 'Operation',
        enum: ['set', 'add', 'subtract', 'multiply', 'divide', 'modulo'],
        default: 'set'
      },
      value: {
        type: 'string',
        title: 'Value',
        description: 'Value to assign (can be number, string, or expression)'
      }
    },
    required: ['variableId', 'value']
  }
} as const;

/**
 * Sets or modifies a game variable
 * 
 * This executor handles setting or modifying game variables with various
 * operations including set, add, subtract, multiply, divide, and modulo.
 * It supports numeric values and can parse string numbers.
 * 
 * @param context - The execution context
 * @param params - Parameters containing variable ID, operation, and value
 * 
 * @example
 * ```typescript
 * // Set a variable to a specific value
 * await setVariableExecutor(context, {
 *   variableId: 'player_score',
 *   operation: 'set',
 *   value: 100
 * });
 * 
 * // Add 10 to an existing variable
 * await setVariableExecutor(context, {
 *   variableId: 'player_score',
 *   operation: 'add',
 *   value: 10
 * });
 * ```
 */
export const set_variable: BlockExecutor<'set_variable'> = async (context, params) => {
  const currentValue = context.player.getVariable(params.variableId);
  const numericCurrentValue = typeof currentValue === 'number' ? currentValue : 0;
  let newValue = params.value;
  
  // If value is a string that looks like a number, parse it
  if (typeof newValue === 'string' && !isNaN(Number(newValue))) {
    newValue = Number(newValue);
  }
  
  const numericNewValue = typeof newValue === 'number' ? newValue : 0;

  switch (params.operation) {
    case 'set':
      context.player.setVariable(params.variableId, numericNewValue);
      break;
    case 'add':
      context.player.setVariable(params.variableId, numericCurrentValue + numericNewValue);
      break;
    case 'subtract':
      context.player.setVariable(params.variableId, numericCurrentValue - numericNewValue);
      break;
    case 'multiply':
      context.player.setVariable(params.variableId, numericCurrentValue * numericNewValue);
      break;
    case 'divide':
      context.player.setVariable(params.variableId, numericCurrentValue / numericNewValue);
      break;
    case 'modulo':
      context.player.setVariable(params.variableId, numericCurrentValue % numericNewValue);
      break;
  }
};

