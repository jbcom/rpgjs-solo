import { excludeTriggers } from '../context-helpers';
import type { BlockExecutor } from '../types';
import { itemSchema } from '@common/schemas/database';

export const schemaChangeEquipment = {
  type: 'change_equipment',
  label: 'Change Equipment',
  description: 'Equip or unequip equipment on the player',
  category: 'character',
  icon: '🛡️',
  requiredCapabilities: ['player', 'equipment'],
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        title: 'Operation',
        enum: ['equip', 'unequip'],
        default: 'equip',
        format: {
          labels: ['Equip', 'Unequip']
        }
      },
      slot: {
        type: 'string',
        title: 'Slot',
        enum: ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'shield'],
        default: 'weapon',
        format: {
          labels: ['Weapon', 'Chest Armor', 'Helmet', 'Gloves', 'Boots', 'Shield']
        }
      }
    },
    allOf: [
      {
        if: {
          properties: {
            operation: { const: 'equip' }
          }
        },
        then: {
          properties: {
            itemId: {
              type: 'string',
              title: 'Item',
              description: 'Select an item from the database',
              $ref: '#/functions/item',
              format: {
                add: {
                  schema: itemSchema
                }
              }
            }
          },
          required: ['itemId']
        }
      }
    ],
    required: ['operation', 'slot']
  }
} as const;

export const change_equipment: BlockExecutor<'change_equipment'> = async (context, params) => {
  const player = context.player as any;
  const slot = params.slot;

  if (params.operation === 'equip') {
    if (!params.itemId) {
      return;
    }
    if (typeof player.equip === 'function') {
      try {
        player.equip(slot, params.itemId);
      } catch {
        player.equip(params.itemId, slot);
      }
      return;
    }
    if (typeof player.setEquipment === 'function') {
      player.setEquipment(slot, params.itemId);
      return;
    }
    if (typeof player.setEquip === 'function') {
      player.setEquip(slot, params.itemId);
      return;
    }
    throw new Error('Player does not support equipment operations');
  }

  if (typeof player.unequip === 'function') {
    player.unequip(slot);
    return;
  }
  if (typeof player.setEquipment === 'function') {
    player.setEquipment(slot, null);
    return;
  }
  if (typeof player.setEquip === 'function') {
    player.setEquip(slot, null);
    return;
  }
  if (typeof player.clearEquipment === 'function') {
    player.clearEquipment(slot);
    return;
  }
  throw new Error('Player does not support equipment operations');
};
