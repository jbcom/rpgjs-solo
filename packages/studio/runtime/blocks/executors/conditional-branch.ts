import type {
  GameExecutionContext,
  BlockExecutor,
  ConditionalBranchParams
} from '../types';
import { executeBlocksRecursively, getExecutorsFromContext } from './execution';
import { CONDITION_TYPE_SETS, createConditionSchema } from '../definitions';
import { evaluateConditionalBranch } from '../condition-evaluator';

export const schemaConditionalBranch = {
  type: 'conditional_branch',
  label: 'Conditional Branch',
  description: 'Execute different actions based on a condition',
  category: 'control',
  icon: '🔀',
  outputs: ['true', 'false'],
  canHaveChildren: true,
  schema: createConditionSchema(
    CONDITION_TYPE_SETS.ALL,
    'Condition',
    'Evaluate a condition to determine execution path'
  )
} as const;

/**
 * Evaluates a condition and executes child blocks based on the result
 * 
 * This executor handles complex conditional logic with multiple condition types:
 * - Variable comparisons (equal, not equal, greater, less, etc.)
 * - Switch states (ON/OFF)
 * - Self switch states (event-specific switches)
 * - Item checks (has item, item count)
 * - Equipment checks (item equipped)
 * - Player level comparisons
 * - Gold comparisons
 * - Custom JavaScript conditions
 * 
 * If the condition evaluates to true, the child blocks are executed recursively.
 * The branch result is stored in context for potential use by other blocks.
 * 
 * @param context - The execution context
 * @param params - Parameters containing condition type, comparison details, and child blocks
 * 
 * @example
 * ```typescript
 * // Check if player has enough gold
 * await conditionalBranchExecutor(context, {
 *   conditionType: 'gold',
 *   goldComparison: 'greater_equal',
 *   goldValueType: 'constant',
 *   goldAmount: 100,
 *   children: [/* blocks to execute if true *\/]
 * });
 * 
 * // Check if switch is ON
 * await conditionalBranchExecutor(context, {
 *   conditionType: 'switch',
 *   switchId: 'door_unlocked',
 *   switchValue: true,
 *   children: [/* blocks *\/]
 * });
 * ```
 */
export const conditional_branch: BlockExecutor<'conditional_branch'> = async (context, params) => {
  const result = evaluateConditionalBranch(params, {
    player: context.player,
    event: context.event,
    evaluateCustomCondition: context.evaluateCondition
  });

  context.setBranchResult(result);
  
  // Execute children blocks if condition is true
  if (result && params.children && Array.isArray(params.children) && params.children.length > 0) {
    const executors = getExecutorsFromContext(context);
    await executeBlocksRecursively(params.children, context, executors);
  }
};
