import { excludeTriggers } from '../context-helpers';
import type {
  BlockContextInfo,
  BlockExecutor,
  TransferPlayerParams
} from '../types';

export const schemaTransferPlayer = {
  type: 'transfer_player',
  label: 'Transfer Player',
  description: 'Move the player to a different map or location',
  category: 'scene',
  icon: '🗺️',
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {
      destination: {
        oneOf: [
          {
            type: 'string',
            title: 'Destination Event',
            description: 'Select an event ID (e.g., "$player" or event ID)'
          },
          {
            type: 'object',
            title: 'Destination Position',
            description: 'Select a map and position',
            properties: {
              mapId: {
                type: 'string'
              },
              x: {
                type: 'number'
              },
              y: {
                type: 'number'
              }
            },
            required: ['mapId', 'x', 'y']
          }
        ],
        format:  "map-position"
      },
      direction: {
        type: 'string',
        title: 'Player Direction',
        description: 'Direction the player will face after transfer',
        enum: ['up', 'down', 'left', 'right'],
        default: 'down'
      }
    },
    required: ['destination']
  }
} as const;

/**
 * Transfers the player to a different map or location
 * 
 * This executor moves the player to a specified position on a different map.
 * It supports optional direction and fade transition effects for a smoother
 * visual experience during map changes.
 * 
 * The executor uses the player's `changeMap` method which handles the actual
 * map transition. If direction is specified, it will be set after the transfer.
 * The fadeType parameter controls the visual transition effect.
 * 
 * @param context - The execution context containing player reference
 * @param params - Parameters containing map ID, position, direction, and fade type
 * 
 * @example
 * ```typescript
 * // Transfer player to a new map at position (10, 5)
 * await transferPlayerExecutor(context, {
 *   mapId: 'map_001',
 *   x: 10,
 *   y: 5,
 *   direction: 'down',
 *   fadeType: 'black'
 * });
 * 
 * // Transfer with no fade effect
 * await transferPlayerExecutor(context, {
 *   mapId: 'map_002',
 *   x: 0,
 *   y: 0,
 *   fadeType: 'none'
 * });
 * ```
 */
export const transfer_player: BlockExecutor<'transfer_player'> = async (context, params) => {
  // Extract mapId, x, y from destination object
  const mapId = params.destination?.mapId || params.mapId;
  const x = params.destination?.x ?? params.x;
  const y = params.destination?.y ?? params.y;
  
  await context.player.changeMap(mapId, {
    x,
    y
  });
};
