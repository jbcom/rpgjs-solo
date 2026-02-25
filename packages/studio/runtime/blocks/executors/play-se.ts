import type {
  GameExecutionContext,
  BlockExecutor,
  PlaySeParams
} from '../types';

export const schemaPlaySe = {
  type: 'play_se',
  label: 'Play Sound Effect',
  description: 'Play a sound effect',
  category: 'audio',
  icon: '🔊',
  schema: {
    type: 'object',
    properties: {
      sound: {
        type: 'string',
        title: 'Sound',
        description: 'Path to the sound effect file',
        format: {
          name: "media",
          type: "sound",
          buttonLabel: "Select Sound Effect",
          useUpload: {
            accept: "audio/*",
          },
        },
      }
    },
    required: ['sound']
  }
} as const;

/**
 * Plays a sound effect
 * 
 * This executor plays a sound effect once. Sound effects are typically
 * short audio clips used for feedback such as button clicks, item pickups,
 * or action sounds.
 * 
 * @param context - The execution context containing player reference
 * @param params - Parameters containing sound file path and optional audio settings
 * 
 * @example
 * ```typescript
 * // Play a sound effect
 * await playSeExecutor(context, {
 *   filename: 'sounds/click.mp3',
 *   sound: 'sounds/click.mp3'
 * });
 * 
 * // Play with custom volume
 * await playSeExecutor(context, {
 *   filename: 'sounds/coin.mp3',
 *   sound: 'sounds/coin.mp3',
 *   volume: 100
 * });
 * ```
 */
export const play_se: BlockExecutor<'play_se'> = async (context, params) => {
  await context.player.playSound(params.sound ?? params.filename);
};

