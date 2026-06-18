import type {
  GameExecutionContext,
  BlockExecutor,
  PlayBgmParams
} from '../types';

export const schemaPlayBgm = {
  type: 'play_bgm',
  label: 'Play Background Music',
  description: 'Play or change the background music',
  category: 'audio',
  icon: '🎵',
  requiredCapabilities: ['player', 'audio'],
  schema: {
    type: 'object',
    properties: {
      music: {
        type: 'string',
        title: 'Music',
        description: 'Path to the music file',
        format: {
          name: "media",
          type: "bgm",
          buttonLabel: "Select Background Music",
          useUpload: {
            accept: "audio/*",
          },
        },
      }
    },
    required: ['filename']
  }
} as const;

/**
 * Plays background music
 * 
 * This executor starts or changes the background music playing in the game.
 * It supports various audio options including volume, pitch, and fade-in effects.
 * 
 * @param context - The execution context containing player reference
 * @param params - Parameters containing music file path and optional audio settings
 * 
 * @example
 * ```typescript
 * // Play background music with default settings
 * await playBgmExecutor(context, {
 *   filename: 'music/town_theme.mp3',
 *   music: 'music/town_theme.mp3'
 * });
 * 
 * // Play with custom volume and fade-in
 * await playBgmExecutor(context, {
 *   filename: 'music/battle_theme.mp3',
 *   music: 'music/battle_theme.mp3',
 *   volume: 80,
 *   fadeIn: 2
 * });
 * ```
 */
export const play_bgm: BlockExecutor<'play_bgm'> = async (context, params) => {
  await context.player.playSound(params.music ?? params.filename);
};
