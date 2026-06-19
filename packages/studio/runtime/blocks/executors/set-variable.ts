import type {
  GameExecutionContext,
  BlockExecutor,
  SetVariableParams,
  VariableOperation
} from '../types';
import { variableSchema } from '@common/schemas/database';

const operationValues: VariableOperation[] = ['set', 'add', 'subtract', 'multiply', 'divide', 'modulo'];

const valueSourceValues = [
  'constant',
  'variable',
  'random',
  'player_x',
  'player_y',
  'player_direction',
  'map_id',
  'gold',
  'player_id',
  'player_name',
  'level',
  'hp',
  'sp'
] as const;

const readCallableOrValue = (value: unknown): unknown => {
  return typeof value === 'function' ? value() : value;
};

const normalizeNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return 0;
};

const normalizeConstant = (value: unknown): string | number => {
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  if (typeof value === 'number' || typeof value === 'string') return value;
  return 0;
};

const getPlayerLevel = (player: any): number => {
  if (typeof player?.level === 'number') return player.level;
  if (typeof player?.getLevel === 'function') return normalizeNumber(player.getLevel());
  return 0;
};

const getMapId = (context: GameExecutionContext): string => {
  const map = context.map ?? context.player?.map ?? context.player?.getCurrentMap?.() ?? context.event?.getCurrentMap?.();
  return String(map?.id ?? map?.mapId ?? map?._id ?? '');
};

export const resolveSetVariableValue = (
  context: GameExecutionContext,
  params: SetVariableParams
): string | number => {
  const source = params.valueSource ?? 'constant';

  switch (source) {
    case 'constant':
      return normalizeConstant(params.value);
    case 'variable':
      return context.getVariable?.(params.sourceVariableId ?? '') ?? context.player.getVariable(params.sourceVariableId ?? '') ?? 0;
    case 'random': {
      const min = normalizeNumber(params.randomMin);
      const max = normalizeNumber(params.randomMax);
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      return Math.floor(Math.random() * (Math.floor(high) - Math.ceil(low) + 1)) + Math.ceil(low);
    }
    case 'player_x':
      return normalizeNumber(readCallableOrValue(context.player?.x));
    case 'player_y':
      return normalizeNumber(readCallableOrValue(context.player?.y));
    case 'player_direction':
      return String(readCallableOrValue(context.player?.direction) ?? '');
    case 'map_id':
      return getMapId(context);
    case 'gold':
      return normalizeNumber(context.player?.gold);
    case 'player_id':
      return String(context.player?.id ?? '');
    case 'player_name':
      return String(context.player?.name ?? '');
    case 'level':
      return getPlayerLevel(context.player);
    case 'hp':
      return normalizeNumber(context.player?.hp);
    case 'sp':
      return normalizeNumber(context.player?.sp);
  }
};

export const applySetVariableOperation = (
  context: GameExecutionContext,
  params: SetVariableParams,
  newValue: string | number
) => {
  const variableId = params.variableId;
  const currentValue = context.getVariable?.(variableId) ?? context.player.getVariable(variableId);
  const operation = params.operation ?? 'set';
  const setVariable = (value: unknown) => {
    if (typeof context.setVariable === 'function') {
      context.setVariable(variableId, value);
      return;
    }
    context.player.setVariable(variableId, value);
  };

  if (operation === 'set') {
    setVariable(newValue);
    return;
  }

  const numericCurrentValue = normalizeNumber(currentValue);
  const numericNewValue = normalizeNumber(newValue);

  switch (operation) {
    case 'add':
      setVariable(numericCurrentValue + numericNewValue);
      break;
    case 'subtract':
      setVariable(numericCurrentValue - numericNewValue);
      break;
    case 'multiply':
      setVariable(numericCurrentValue * numericNewValue);
      break;
    case 'divide':
      setVariable(numericCurrentValue / numericNewValue);
      break;
    case 'modulo':
      setVariable(numericCurrentValue % numericNewValue);
      break;
  }
};

export const schemaSetVariable = {
  type: 'set_variable',
  label: 'Set Variable',
  description: 'Set the value of a game variable',
  category: 'variable',
  icon: '📝',
  requiredCapabilities: ['player', 'variables'],
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
        enum: operationValues,
        default: 'set',
        format: {
          labels: ['Set', 'Add', 'Subtract', 'Multiply', 'Divide', 'Modulo']
        }
      },
      valueSource: {
        type: 'string',
        title: 'Value Source',
        enum: valueSourceValues,
        default: 'constant',
        format: {
          labels: [
            'Constant',
            'Variable',
            'Random',
            'Player X',
            'Player Y',
            'Player Direction',
            'Map ID',
            'Gold',
            'Player ID',
            'Player Name',
            'Level',
            'HP',
            'SP'
          ]
        }
      }
    },
    allOf: [
      {
        if: {
          properties: {
            valueSource: { const: 'constant' }
          }
        },
        then: {
          properties: {
            value: {
              type: 'string',
              title: 'Value',
              description: 'Free value to assign or use in the operation'
            }
          },
          required: ['value']
        },
        else: {
          if: {
            properties: {
              valueSource: { const: 'variable' }
            }
          },
          then: {
            properties: {
              sourceVariableId: {
                type: 'string',
                title: 'Source Variable',
                description: 'Variable containing the value to use',
                $ref: '#/functions/variable',
                format: {
                  add: {
                    schema: variableSchema
                  }
                }
              }
            },
            required: ['sourceVariableId']
          },
          else: {
            if: {
              properties: {
                valueSource: { const: 'random' }
              }
            },
            then: {
              properties: {
                randomMin: {
                  type: 'number',
                  title: 'Minimum',
                  default: 0
                },
                randomMax: {
                  type: 'number',
                  title: 'Maximum',
                  default: 100
                }
              },
              required: ['randomMin', 'randomMax']
            }
          }
        }
      }
    ],
    required: ['variableId', 'valueSource']
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
  applySetVariableOperation(context, params, resolveSetVariableValue(context, params));
};
