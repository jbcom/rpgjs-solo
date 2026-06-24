import type {
  BlockDefinition,
  BlockExecutor,
  CameraFollowParams,
  CameraFollowSmoothMove,
} from '../types';
import { getEvent } from './utils';

export const cameraFollowEaseValues = [
  'linear',
  'easeInQuad',
  'easeOutQuad',
  'easeInOutQuad',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeInQuart',
  'easeOutQuart',
  'easeInOutQuart',
  'easeInQuint',
  'easeOutQuint',
  'easeInOutQuint',
  'easeInSine',
  'easeOutSine',
  'easeInOutSine',
  'easeInExpo',
  'easeOutExpo',
  'easeInOutExpo',
  'easeInCirc',
  'easeOutCirc',
  'easeInOutCirc',
  'easeInBack',
  'easeOutBack',
  'easeInOutBack'
] as const;

const buildSmoothMoveOptions = (params: CameraFollowParams): CameraFollowSmoothMove => {
  if (params.smoothMove === false) {
    return false;
  }
  if (params.time !== undefined || params.ease) {
    return {
      ...(params.time !== undefined ? { time: params.time } : {}),
      ...(params.ease ? { ease: params.ease } : {}),
    };
  }
  return params.smoothMove ?? true;
};

export const schemaCameraFollow: BlockDefinition<'camera_follow'> = {
  type: 'camera_follow',
  label: 'Camera Follow',
  description: 'Make the current player camera follow the player or a map event',
  category: 'scene',
  icon: '📷',
  requiredCapabilities: ['player', 'map'],
  schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        title: 'Target',
        description: 'Select the player, current event, or another map event',
        default: '$player',
        format: {
          name: 'map-position',
          displayMode: 'single-map',
          selectionMode: 'event',
          returnType: 'eventId',
          player: true
        }
      },
      smoothMove: {
        type: 'boolean',
        title: 'Smooth Move',
        description: 'Move the camera smoothly instead of instantly',
        default: true
      },
      time: {
        type: 'number',
        title: 'Transition Time',
        description: 'Optional smooth transition duration in milliseconds',
        minimum: 0
      },
      ease: {
        type: 'string',
        title: 'Easing',
        description: 'Optional easing name supported by the RPGJS camera API',
        enum: cameraFollowEaseValues,
        default: 'easeInOutQuad',
        format: {
          labels: [
            'Linear',
            'In Quad',
            'Out Quad',
            'In Out Quad',
            'In Cubic',
            'Out Cubic',
            'In Out Cubic',
            'In Quart',
            'Out Quart',
            'In Out Quart',
            'In Quint',
            'Out Quint',
            'In Out Quint',
            'In Sine',
            'Out Sine',
            'In Out Sine',
            'In Expo',
            'Out Expo',
            'In Out Expo',
            'In Circ',
            'Out Circ',
            'In Out Circ',
            'In Back',
            'Out Back',
            'In Out Back'
          ]
        }
      }
    },
    required: ['eventId']
  }
};

export const camera_follow: BlockExecutor<'camera_follow'> = async (context, params) => {
  const target = getEvent(context, { eventId: params.eventId });
  if (!target) {
    return;
  }

  context.player.cameraFollow(target, {
    smoothMove: buildSmoothMoveOptions(params)
  });
};
