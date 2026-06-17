import { excludeTriggers } from '../context-helpers';
import type {
  AnyBlockInstance,
  BlockExecutor,
  CommonEventPositionParams,
} from '../types';
import { executeBlocksRecursively, getExecutorsFromContext } from './execution';

const DEFAULT_MAX_DEPTH = 10;

export const schemaCallCommonEvent = {
  type: 'call_common_event',
  label: 'Call Event',
  description: 'Execute the selected event workflow in the current context',
  category: 'system',
  icon: '🔁',
  schema: {
    type: 'object',
    properties: {
      commonEventId: {
        type: 'string',
        title: 'Event',
        description: 'Event to execute',
        $ref: '#/functions/commonEvent'
      },
      parameters: {
        type: 'object',
        title: 'Parameters',
        description: 'Key/value parameters available to the called event',
        additionalProperties: true
      },
      maxDepth: {
        type: 'number',
        title: 'Max Recursion Depth',
        description: 'Stops recursive event calls from looping forever',
        minimum: 1,
        maximum: 50,
        default: DEFAULT_MAX_DEPTH
      }
    },
    required: ['commonEventId']
  }
} as const;

export const schemaSpawnCommonEvent = {
  type: 'spawn_common_event',
  label: 'Spawn Event',
  description: 'Create a visible event object on the current map',
  category: 'scene',
  icon: '➕',
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {
      commonEventId: {
        type: 'string',
        title: 'Event',
        description: 'Event object to spawn',
        $ref: '#/functions/commonEvent'
      },
      positionMode: {
        type: 'string',
        title: 'Position Source',
        enum: ['player', 'current_event', 'variable', 'fixed'],
        default: 'player',
        format: {
          labels: ['Current Player', 'Current Event', 'Variable', 'Fixed Position']
        }
      }
    },
    required: ['commonEventId', 'positionMode'],
    allOf: [
      {
        if: {
          properties: {
            positionMode: { const: 'variable' }
          }
        },
        then: {
          properties: {
            positionVariableXId: {
              type: 'string',
              title: 'Variable X',
              description: 'Variable containing the X position',
              $ref: '#/functions/variable'
            },
            positionVariableYId: {
              type: 'string',
              title: 'Variable Y',
              description: 'Variable containing the Y position',
              $ref: '#/functions/variable'
            }
          },
          required: ['positionVariableXId', 'positionVariableYId']
        }
      },
      {
        if: {
          properties: {
            positionMode: { const: 'fixed' }
          }
        },
        then: {
          properties: {
            position: {
              type: 'object',
              title: 'Position',
              description: 'Select a fixed position on the current map',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' }
              },
              format: {
                name: 'map-position',
                displayMode: 'single-map',
                selectionMode: 'position',
                returnType: 'position'
              }
            }
          },
          required: ['position']
        }
      }
    ]
  }
} as const;

const getCommonEventBlocks = (commonEvent: unknown): AnyBlockInstance[] => {
  if (!commonEvent || typeof commonEvent !== 'object') return [];
  const triggers = Array.isArray((commonEvent as any).triggers) ? (commonEvent as any).triggers : [];
  const trigger =
    triggers.find((entry: any) => entry?.enabled !== false && entry?.type === 'onAction') ??
    triggers.find((entry: any) => entry?.enabled !== false && Array.isArray(entry?.blocks)) ??
    null;

  return Array.isArray(trigger?.blocks) ? trigger.blocks : [];
};

const getCoordinate = (target: any, axis: 'x' | 'y') => {
  const value = target?.[axis];
  return typeof value === 'function' ? value.call(target) : value ?? 0;
};

const getCommonEventPosition = (context: any, params: CommonEventPositionParams) => {
  if (params.positionMode === 'variable') {
    const xValue = Number(context.getVariable?.(params.positionVariableXId ?? '') ?? 0);
    const yValue = Number(context.getVariable?.(params.positionVariableYId ?? '') ?? 0);

    return {
      x: Number.isFinite(xValue) ? xValue : 0,
      y: Number.isFinite(yValue) ? yValue : 0,
    };
  }

  if (params.positionMode === 'player') {
    return {
      x: getCoordinate(context.player, 'x'),
      y: getCoordinate(context.player, 'y'),
    };
  }

  if (params.positionMode === 'current_event') {
    return {
      x: getCoordinate(context.event, 'x'),
      y: getCoordinate(context.event, 'y'),
    };
  }

  if (params.position && typeof params.position.x === 'number' && typeof params.position.y === 'number') {
    return {
      x: params.position.x,
      y: params.position.y,
    };
  }

  if (params.positionMode === 'explicit') {
    return {
      x: Number(params.x ?? 0),
      y: Number(params.y ?? 0),
    };
  }

  return {
    x: getCoordinate(context.event, 'x'),
    y: getCoordinate(context.event, 'y'),
  };
};

export const call_common_event: BlockExecutor<'call_common_event'> = async (context, params) => {
  const commonEventId = params.commonEventId ?? params.eventId;
  if (!commonEventId) return;

  const commonEvent = await context.getCommonEvent?.(commonEventId);
  const blocks = getCommonEventBlocks(commonEvent);

  if (blocks.length === 0) {
    await context.callEvent?.(commonEventId, params.parameters ?? {});
    return;
  }

  const state = context.commonEventExecutionState ?? {
    depth: 0,
    parameters: {},
  };
  const maxDepth = params.maxDepth ?? DEFAULT_MAX_DEPTH;

  if (state.depth >= maxDepth) {
    console.warn(`Common event recursion depth exceeded for ${commonEventId}`);
    return;
  }

  const executors = getExecutorsFromContext(context);
  const nextContext = {
    ...context,
    commonEventExecutionState: {
      depth: state.depth + 1,
      parameters: {
        ...state.parameters,
        ...(params.parameters ?? {}),
      },
    },
  };

  await executeBlocksRecursively(blocks, nextContext, executors);
};

export const spawn_common_event: BlockExecutor<'spawn_common_event'> = async (context, params) => {
  const commonEventId = params.commonEventId ?? params.eventId;
  if (!commonEventId) return;

  const commonEvent = await context.getCommonEvent?.(commonEventId);
  if (!commonEvent) return;

  const position = getCommonEventPosition(context, params);
  await context.spawnCommonEvent?.(commonEventId, position, {
    mode: params.mode ?? 'shared',
  });
};
