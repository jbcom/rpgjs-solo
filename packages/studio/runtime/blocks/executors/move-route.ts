import type {
  BlockExecutor,
  GameExecutionContext,
  MoveRouteParams,
  MoveRouteCommand
} from '../types';
import { getEvent } from './utils';

type Direction = 'up' | 'down' | 'left' | 'right';

const speedMap: Record<string, number> = {
  slowest: 0.2,
  slower: 0.5,
  slow: 1,
  normal: 3,
  fast: 5,
  faster: 7,
  fastest: 10
};

const frequencyMap: Record<string, number> = {
  lowest: 600,
  lower: 400,
  low: 200,
  normal: 100,
  high: 100,
  higher: 50,
  highest: 25,
  none: 0
};

const directionOrder: Direction[] = ['up', 'right', 'down', 'left'];

const getDirectionValue = (value: unknown): Direction => {
  if (value === 'up' || value === 'down' || value === 'left' || value === 'right') {
    return value;
  }
  return 'down';
};

const getFacingDirection = (entity: any): Direction => {
  const raw = typeof entity?.direction === 'function' ? entity.direction() : entity?.direction;
  return getDirectionValue(raw);
};

const rotateDirection = (direction: Direction, offset: number): Direction => {
  const index = directionOrder.indexOf(direction);
  const nextIndex = (index + offset + directionOrder.length) % directionOrder.length;
  return directionOrder[nextIndex];
};

const getTurnCommand = (moveApi: any, direction: Direction) => {
  if (!moveApi) {
    return `turn-${direction}`;
  }
  switch (direction) {
    case 'up':
      return moveApi.turnUp();
    case 'down':
      return moveApi.turnDown();
    case 'left':
      return moveApi.turnLeft();
    case 'right':
      return moveApi.turnRight();
    default:
      return `turn-${direction}`;
  }
};

const setVisibility = (target: any, value: boolean): void => {
  if (!target) {
    return;
  }
  if (typeof target.visible?.set === 'function') {
    target.visible.set(value);
    return;
  }
  if (typeof target.visible === 'function') {
    try {
      target.visible(value);
      return;
    } catch {
      // Fall through to assignment
    }
  }
  if (typeof target.visible === 'boolean') {
    target.visible = value;
  }
};

const applyRouteCommand = (
  command: MoveRouteCommand,
  context: GameExecutionContext,
  target: any
): unknown => {
  const moveApi = context.moveApi;
  switch (command.action) {
    case 'move_down':
      return moveApi?.tileDown?.();
    case 'move_left':
      return moveApi?.tileLeft?.();
    case 'move_right':
      return moveApi?.tileRight?.();
    case 'move_up':
      return moveApi?.tileUp?.();
    case 'move_random':
      return moveApi?.tileRandom?.();
    case 'move_toward_player':
      if (!context.player) {
        return undefined;
      }
      return moveApi?.tileTowardPlayer?.(context.player);
    case 'move_away_from_player':
      if (!context.player) {
        return undefined;
      }
      return moveApi?.tileAwayFromPlayer?.(context.player);
    case 'turn_down':
      return moveApi?.turnDown?.();
    case 'turn_left':
      return moveApi?.turnLeft?.();
    case 'turn_right':
      return moveApi?.turnRight?.();
    case 'turn_up':
      return moveApi?.turnUp?.();
    case 'turn_90_right':
      return () => getTurnCommand(moveApi, rotateDirection(getFacingDirection(target), 1));
    case 'turn_90_left':
      return () => getTurnCommand(moveApi, rotateDirection(getFacingDirection(target), -1));
    case 'turn_180':
      return () => getTurnCommand(moveApi, rotateDirection(getFacingDirection(target), 2));
    case 'turn_90_left_or_right':
      return () => {
        const offset = Math.random() > 0.5 ? 1 : -1;
        return getTurnCommand(moveApi, rotateDirection(getFacingDirection(target), offset));
      };
    case 'turn_random':
      return moveApi?.turnRandom?.();
    case 'turn_toward_player':
      if (!context.player) {
        return undefined;
      }
      return moveApi?.turnTowardPlayer?.(context.player);
    case 'turn_away_from_player':
      if (!context.player) {
        return undefined;
      }
      return moveApi?.turnAwayFromPlayer?.(context.player);
    case 'change_speed':
      return (player: any) => {
        const rawValue = command.value ?? 'normal';
        const value = typeof rawValue === 'number'
          ? rawValue
          : speedMap[String(rawValue)] ?? speedMap['normal'];
        if (player) {
          player.speed = value;
        }
      };
    case 'change_frequency':
      return (player: any) => {
        const rawValue = command.value ?? 'normal';
        const value = typeof rawValue === 'number'
          ? rawValue
          : frequencyMap[String(rawValue)] ?? frequencyMap['normal'];
        if (player) {
          player.frequency = value;
        }
      };
    case 'set_visible':
      return (player: any) => {
        setVisibility(player, Boolean(command.value));
      };
    case 'set_move_animation':
      return (player: any) => {
        if (player) {
          player.animationFixed = Boolean(command.value);
        }
      };
    case 'set_direction_fix':
      return (player: any) => {
        if (player) {
          player.directionFixed = Boolean(command.value);
        }
      };
    case 'set_through':
      return (player: any) => {
        if (player) {
          player.through = Boolean(command.value);
        }
      };
    case 'set_can_move':
      return (player: any) => {
        if (player) {
          player.canMove = Boolean(command.value);
        }
      };
    case 'set_through_other_player':
      return (player: any) => {
        if (player) {
          player.throughOtherPlayer = Boolean(command.value);
        }
      };
    case 'set_always_on_top':
      return (player: any) => {
        if (!player) {
          return;
        }
        const isOnTop = Boolean(command.value);
        if (player.z?.set) {
          player.z.set(isOnTop ? 1000 : 0);
          return;
        }
        player.z = isOnTop ? 1000 : 0;
      };
    case 'set_always_on_bottom':
      return (player: any) => {
        if (!player) {
          return;
        }
        const isOnBottom = Boolean(command.value);
        if (player.z?.set) {
          player.z.set(isOnBottom ? -1000 : 0);
          return;
        }
        player.z = isOnBottom ? -1000 : 0;
      };
    default:
      return undefined;
  }
};

export const schemaMoveRoute = {
  type: 'move_route',
  label: 'Move Route',
  description: 'Define a custom movement route for an event or player',
  category: 'character',
  icon: '🧭',
  requiredCapabilities: ['map'],
  schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        title: 'Event',
        format: {
          name: 'map-position',
          displayMode: 'single-map',
          selectionMode: 'event',
          returnType: 'eventId',
          player: true
        }
      },
      repeat: {
        type: 'boolean',
        title: 'Repeat Route',
        default: false
      },
      ignoreIfBlocked: {
        type: 'boolean',
        title: 'Ignore If Blocked',
        default: false
      },
      route: {
        type: 'array',
        title: 'Route Commands',
        format: {
          name: 'move-route',
          gridSize: 9,
          showPreview: true
        },
        items: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              title: 'Command',
              enum: [
                'move_down',
                'move_left',
                'move_right',
                'move_up',
                'move_random',
                'move_toward_player',
                'move_away_from_player',
                'turn_down',
                'turn_left',
                'turn_right',
                'turn_up',
                'turn_90_right',
                'turn_90_left',
                'turn_180',
                'turn_90_left_or_right',
                'turn_random',
                'turn_toward_player',
                'turn_away_from_player',
                'change_speed',
                'change_frequency',
                'set_visible',
                'set_move_animation',
                'set_direction_fix',
                'set_through',
                'set_always_on_top',
                'set_always_on_bottom',
                'set_can_move',
                'set_through_other_player'
              ],
              format: {
                labels: [
                  'Move Down',
                  'Move Left',
                  'Move Right',
                  'Move Up',
                  'Move Random',
                  'Move Toward Player',
                  'Move Away From Player',
                  'Turn Down',
                  'Turn Left',
                  'Turn Right',
                  'Turn Up',
                  'Turn 90 deg Right',
                  'Turn 90 deg Left',
                  'Turn 180 deg',
                  'Turn 90 deg Left/Right',
                  'Turn Random',
                  'Turn Toward Player',
                  'Turn Away From Player',
                  'Change Speed',
                  'Change Frequency',
                  'Show/Hide',
                  'Fix Move Animation',
                  'Fix Direction',
                  'Through',
                  'Always On Top',
                  'Always On Bottom',
                  'Block Movement',
                  'Through Other Player'
                ]
              }
            },
            value: {
              type: ['string', 'boolean', 'number'],
              title: 'Value'
            }
          },
          required: ['action'],
          allOf: [
            {
              if: {
                properties: {
                  action: { const: 'change_speed' }
                }
              },
              then: {
                properties: {
                  value: {
                    type: 'number',
                    title: 'Speed',
                    enum: [0.2, 0.5, 1, 3, 5, 7, 10],
                    default: 3,
                    format: {
                      labels: ['Slowest', 'Slower', 'Slow', 'Normal', 'Fast', 'Faster', 'Fastest']
                    }
                  }
                },
                required: ['value']
              }
            },
            {
              if: {
                properties: {
                  action: { const: 'change_frequency' }
                }
              },
              then: {
                properties: {
                  value: {
                    type: 'number',
                    title: 'Frequency',
                    enum: [600, 400, 200, 100, 50, 25, 0],
                    default: 0,
                    format: {
                      labels: ['Lowest', 'Lower', 'Low', 'High', 'Higher', 'Highest', 'None']
                    }
                  }
                },
                required: ['value']
              }
            },
            {
              if: {
                properties: {
                  action: {
                    enum: [
                      'set_visible',
                      'set_move_animation',
                      'set_direction_fix',
                      'set_through',
                      'set_always_on_top',
                      'set_always_on_bottom',
                      'set_can_move',
                      'set_through_other_player'
                    ]
                  }
                }
              },
              then: {
                properties: {
                  value: {
                    type: 'boolean',
                    title: 'Enabled',
                    default: true
                  }
                },
                required: ['value']
              }
            }
          ]
        },
        minItems: 1
      }
    },
    required: ['eventId', 'route']
  }
} as const;

export const move_route: BlockExecutor<'move_route'> = async (context, params) => {
  const character = getEvent(context, params);
  if (!character) {
    return;
  }

  const routes = (params.route || [])
    .map((command) => applyRouteCommand(command, context, character))
    .filter((command) => command !== undefined);

  const options = params.ignoreIfBlocked
    ? { onStuck: () => true }
    : undefined;

  if (params.repeat) {
    const infiniteMoveRoute = (character as any).infiniteMoveRoute;
    if (typeof infiniteMoveRoute === 'function') {
      infiniteMoveRoute.call(character, routes, options);
    }
    return;
  }

  const moveRoutes = (character as any).moveRoutes;
  if (typeof moveRoutes === 'function') {
    await moveRoutes.call(character, routes, options);
  }
};
