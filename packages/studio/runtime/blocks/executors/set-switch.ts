import type {
  GameExecutionContext,
  BlockExecutor,
  SetSwitchParams
} from '../types';

export const schemaSetSwitch = {
  type: 'set_switch',
  label: 'Set Switch',
  description: 'Turn a game switch ON or OFF',
  category: 'variable',
  icon: '🔘',
  requiredCapabilities: ['player', 'variables'],
  schema: {
    type: 'object',
    properties: {
      switchName: {
        type: 'string',
        title: 'Switch Name',
        description: 'Name of the switch to control',
        $ref: '#/functions/variable'
      },
      value: {
        type: 'boolean',
        title: 'Switch Value',
        description: 'Turn switch ON (true) or OFF (false)',
        default: true
      }
    },
    required: ['switchName', 'value']
  }
} as const;

/**
 * Sets a game switch ON or OFF
 * 
 * This executor controls game switches that can be used to track
 * boolean game states. Switches are commonly used for flags, triggers,
 * and conditional logic throughout the game.
 * 
 * @param context - The execution context
 * @param params - Parameters containing switch name and value
 * 
 * @example
 * ```typescript
 * // Turn on a switch
 * await setSwitchExecutor(context, {
 *   switchName: 'door_unlocked',
 *   value: true
 * });
 * 
 * // Turn off a switch
 * await setSwitchExecutor(context, {
 *   switchName: 'quest_completed',
 *   value: false
 * });
 * ```
 */
export const set_switch: BlockExecutor<'set_switch'> = async (context, params) => {
  context.player.setVariable(params.switchName, params.value);
};
