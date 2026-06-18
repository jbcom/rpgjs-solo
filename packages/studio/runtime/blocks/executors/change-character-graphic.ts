import type {
  GameExecutionContext,
  BlockExecutor,
  ChangeCharacterGraphicParams,
  BlockDefinition
} from '../types';
import { getEvent } from './utils';
import { characterSchema } from '@common/schemas/event';

export const schemaChangeCharacterGraphic: BlockDefinition<'change_character_graphic'> = {
  type: 'change_character_graphic',
  label: 'Change Character Graphic',
  description: 'Change the appearance of a character',
  category: 'character',
  icon: '🎭',
  requiredCapabilities: ['map'],
  schema: {
    type: 'object',
    properties: {
      eventId: {
        type: 'string',
        title: 'Event',
        format: {
          name: "map-position",
          displayMode: "single-map",
          selectionMode: "event",
          returnType: "eventId",
          player: true
        }
      },
      spritesheet: {
        type: 'string',
        title: 'Spritesheet Path',
        description: 'Path to the new character spritesheet',
        format: characterSchema.graphic.format
      }
    },
    required: ['eventId', 'spritesheet']
  },
  /**
   * Adapts the schema based on the trigger context
   * 
   * If the trigger is 'onInit', excludes '$player' from available options
   * because the player doesn't exist yet during initialization.
   * 
   * The schema adaptation modifies the eventId field to add excludeValues
   * which will be used by the form system to filter out '$player' when
   * resolving the $ref to #/functions/event.
   * 
   * @example
   * ```typescript
   * // When trigger is 'onInit', the eventId field will not include '$player' option
   * // When trigger is 'onAction' or other triggers, all options including '$player' are available
   * ```
   */
  schemaAdaptation: (context, schema) => {
    // If trigger is onInit, modify the eventId schema to exclude $player
    if (context.trigger === 'onInit') {
      const adaptedSchema = {
        ...schema,
        properties: {
           spritesheet: {
            ...schema.properties.spritesheet
           }
        }
      };
      return adaptedSchema;
    }
    return schema;
  }
};

/**
 * Changes the appearance of a character
 * 
 * This executor modifies the spritesheet/graphic used by a character or event.
 * It can target the player, the current event, or any other event on the map.
 * 
 * @param context - The execution context
 * @param params - Parameters containing event ID and spritesheet path
 * 
 * @example
 * ```typescript
 * // Change the player's graphic
 * await changeCharacterGraphicExecutor(context, {
 *   eventId: '$player',
 *   spritesheet: 'characters/hero_wounded.png'
 * });
 * 
 * // Change an NPC's graphic
 * await changeCharacterGraphicExecutor(context, {
 *   eventId: 'npc_001',
 *   spritesheet: 'characters/npc_happy.png'
 * });
 * ```
 */
export const change_character_graphic: BlockExecutor<'change_character_graphic'> = async (context, params) => {
  const character = getEvent(context, params);
  if (!character) {
    return;
  }
  await character.setGraphic(params.spritesheet);
};
