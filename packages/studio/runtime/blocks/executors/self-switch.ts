import type {
  GameExecutionContext,
  BlockExecutor,
  SelfSwitchParams
} from '../types';

export const schemaSelfSwitch = {
  type: 'self_switch',
  label: 'Self Switch',
  description: 'Turn a self switch ON or OFF',
  category: 'variable',
  icon: '🔘',
  requiredCapabilities: ['event', 'variables'],
  schema: {
    type: 'object',
    properties: {
      switchName: {
        type: 'string',
        title: 'Switch Name',
        description: 'Name of the self switch to control',
        enum: ['A', 'B', 'C', 'D', 'E', 'F']
      },
      value: {
        type: 'boolean',
        title: 'Self Switch Value',
        description: 'Turn switch ON (true) or OFF (false)',
        default: true
      }
    },
    required: ['switchName', 'value']
  }
} as const;

/**
 * Sets a self switch ON or OFF for the current event
 * 
 * This executor controls self switches which are event-specific switches.
 * Self switches are stored as {eventId}_{switchName} and allow events to
 * track their own internal state independently from global switches.
 * 
 * @param context - The execution context containing the event reference
 * @param params - Parameters containing switch name (A-F) and value
 * 
 * @example
 * ```typescript
 * // Turn on self switch A for the current event
 * await selfSwitchExecutor(context, {
 *   switchName: 'A',
 *   value: true
 * });
 * 
 * // Turn off self switch B
 * await selfSwitchExecutor(context, {
 *   switchName: 'B',
 *   value: false
 * });
 * ```
 */
export const self_switch: BlockExecutor<'self_switch'> = async (context, params) => {
  context.setVariable(context.event.id + '_' + params.switchName, params.value);
};
