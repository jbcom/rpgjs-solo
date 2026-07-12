import { variableSchema } from '../../schemas/database'
import { excludeTriggers } from '../context-helpers'
import type { BlockExecutor } from '../types'

export const schemaShowInput = {
  type: 'show_input',
  label: 'Show Input',
  description: 'Ask the player to enter a text or numeric value and store the result',
  category: 'message',
  icon: '⌨️',
  requiredCapabilities: ['player', 'ui'],
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {
      message: { type: 'string', title: 'Message' },
      title: { type: 'string', title: 'Title' },
      variableId: {
        type: 'string',
        title: 'Result Variable',
        description: 'Variable that receives the string, number, or null result',
        $ref: '#/functions/variable',
        format: { add: { schema: variableSchema } }
      },
      control: {
        type: 'string',
        title: 'Control',
        enum: ['input', 'textarea'],
        default: 'input',
        format: { labels: ['Input', 'Textarea'] }
      },
      type: {
        type: 'string',
        title: 'Value Type',
        enum: ['text', 'number', 'password', 'email'],
        default: 'text',
        format: { labels: ['Text', 'Number', 'Password', 'Email'] }
      },
      placeholder: { type: 'string', title: 'Placeholder' },
      required: { type: 'boolean', title: 'Required', default: false },
      confirmText: { type: 'string', title: 'Confirm Button' },
      cancelText: { type: 'string', title: 'Cancel Button' }
    },
    allOf: [
      {
        if: { properties: { control: { const: 'textarea' } } },
        then: { properties: {
          type: { const: 'text', default: 'text' },
          defaultValue: { type: 'string', title: 'Default Value' },
          minLength: { type: 'number', title: 'Minimum Length', minimum: 0 },
          maxLength: { type: 'number', title: 'Maximum Length', minimum: 0 },
          rows: { type: 'number', title: 'Rows', minimum: 1, default: 4 }
        } },
        else: {
          allOf: [
            {
              if: { properties: { type: { const: 'number' } } },
              then: { properties: {
                defaultValue: { type: 'number', title: 'Default Value' },
                min: { type: 'number', title: 'Minimum Value' },
                max: { type: 'number', title: 'Maximum Value' },
                step: { type: 'number', title: 'Step', exclusiveMinimum: 0 }
              } },
              else: { properties: {
                defaultValue: { type: 'string', title: 'Default Value' },
                minLength: { type: 'number', title: 'Minimum Length', minimum: 0 },
                maxLength: { type: 'number', title: 'Maximum Length', minimum: 0 }
              } }
            }
          ]
        }
      }
    ],
    required: ['message', 'variableId']
  }
} as const

export const show_input: BlockExecutor<'show_input'> = async (context, params) => {
  const control = params.control === 'textarea' ? 'textarea' : 'input'
  const type = control === 'textarea' ? 'text' : (params.type ?? 'text')
  const common = {
    title: params.title,
    placeholder: params.placeholder,
    required: params.required,
    confirmText: params.confirmText,
    cancelText: params.cancelText,
  }

  let result: string | number | null
  if (control === 'textarea') {
    result = await context.player.showInput(params.message, {
      ...common,
      control,
      type: 'text',
      defaultValue: typeof params.defaultValue === 'string' ? params.defaultValue : undefined,
      minLength: params.minLength,
      maxLength: params.maxLength,
      rows: params.rows,
    })
  } else if (type === 'number') {
    result = await context.player.showInput(params.message, {
      ...common,
      control,
      type,
      defaultValue: typeof params.defaultValue === 'number' ? params.defaultValue : undefined,
      min: params.min,
      max: params.max,
      step: params.step,
    })
  } else {
    result = await context.player.showInput(params.message, {
      ...common,
      control,
      type,
      defaultValue: typeof params.defaultValue === 'string' ? params.defaultValue : undefined,
      minLength: params.minLength,
      maxLength: params.maxLength,
    })
  }

  context.setVariable(params.variableId, result)
}
