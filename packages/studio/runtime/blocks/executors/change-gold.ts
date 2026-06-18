import { excludeTriggers } from '../context-helpers';
import { createVariableModificationSchema, OPERATION_SETS } from '../definitions';
import type {
  BlockExecutor,
} from '../types';
import { getValue } from './utils';

export const schemaGold = {
  type: 'change_gold',
  label: 'Change Gold',
  description: 'Modify the player\'s gold amount',
  category: 'variable',
  icon: '💰',
  requiredCapabilities: ['player'],
  contextCondition: excludeTriggers('onInit'),
  schema: createVariableModificationSchema(
    OPERATION_SETS.CURRENCY,
    'Amount',
    'Constant amount of gold to modify',
    'Amount Variable',
    'Variable containing the amount of gold to modify'
  )
} as const;

/**
 * Modifies the player's gold amount
 * 
 * This executor handles changing the player's gold with various operations.
 * It supports both constant amounts and variable-based amounts, allowing
 * for flexible gold management in the game.
 * 
 * @param context - The execution context containing player reference
 * @param params - Parameters containing operation type, amount source, and value
 * 
 * @example
 * ```typescript
 * // Add 100 gold
 * await changeGoldExecutor(context, {
 *   type: 'constant',
 *   operation: 'add',
 *   amount: 100
 * });
 * 
 * // Set gold from a variable
 * await changeGoldExecutor(context, {
 *   type: 'variable',
 *   operation: 'set',
 *   amountVariableId: 'gold_reward'
 * });
 * ```
 */
export const change_gold: BlockExecutor<'change_gold'> = async (context, params) => {
  const amount = getValue(context, params);
  
  switch (params.operation) {
    case 'set':
      context.player.gold = amount;
      break;
    case 'add':
      context.player.gold += amount;
      break;
    case 'sub':
      context.player.gold = Math.max(0, context.player.gold - amount);
      break;
    case 'mul':
      context.player.gold *= amount;
      break;
    case 'div':
      context.player.gold = Math.floor(context.player.gold / amount);
      break;
    case 'mod':
      context.player.gold = context.player.gold % amount;
      break;
  }
};
