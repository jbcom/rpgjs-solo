import { excludeTriggers } from '../context-helpers';
import type {
  GameExecutionContext,
  BlockExecutor,
  ChangeItemParams
} from '../types';
import { variableSchema, itemSchema } from '@common/schemas/database';

export const schemaChangeItem = {
  type: 'change_item',
  label: 'Change Item',
  description: 'Add or remove items from the player\'s inventory',
  category: 'variable',
  icon: '📦',
  requiredCapabilities: ['player', 'inventory'],
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
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
      },
      operation: {
        type: 'string',
        title: 'Operation',
        enum: ['add', 'remove'],
        default: 'add',
        format: {
          labels: ['Add Item', 'Remove Item']
        }
      },
      amountType: {
        type: 'string',
        title: 'Amount Type',
        enum: ['constant', 'variable'],
        default: 'constant',
        format: {
          radio: true,
          horizontal: true,
          labels: ['Constant', 'Variable']
        }
      }
    },
    allOf: [
      {
        if: {
          properties: {
            amountType: { const: 'constant' }
          }
        },
        then: {
          properties: {
            amount: {
              type: 'number',
              title: 'Amount',
              description: 'Number of items to add or remove',
              minimum: 1,
              default: 1
            }
          },
          required: ['amount']
        },
        else: {
          properties: {
            amountVariableId: {
              type: 'string',
              title: 'Amount Variable',
              description: 'Variable containing the number of items to add or remove',
              $ref: '#/functions/variable',
              format: {
                add: {
                  schema: variableSchema
                }
              }
            }
          },
          required: ['amountVariableId']
        }
      }
    ],
    required: ['itemId', 'operation', 'amountType']
  }
} as const;

/**
 * Adds or removes items from the player's inventory
 * 
 * This executor handles adding or removing items from the player's inventory.
 * Before adding an item, it checks if it exists in the map's database.
 * If not, it fetches the item data from the API and adds it to the map's database.
 * 
 * @param context - The execution context containing player and map references
 * @param params - Parameters containing item ID, operation, and amount
 * 
 * @example
 * ```typescript
 * // Add 5 potions
 * await changeItemExecutor(context, {
 *   itemId: 'potion',
 *   operation: 'add',
 *   amountType: 'constant',
 *   amount: 5
 * });
 * 
 * // Remove items using a variable amount
 * await changeItemExecutor(context, {
 *   itemId: 'potion',
 *   operation: 'remove',
 *   amountType: 'variable',
 *   amountVariableId: 'items_to_remove'
 * });
 * ```
 */
export const change_item: BlockExecutor<'change_item'> = async (context, params) => {
  const amount = params.amountType === 'constant'
    ? (params.amount ?? 1)
    : (() => {
        const v = context.getVariable(params.amountVariableId ?? '');
        return typeof v === 'number' ? v : 1;
      })();

  // Only check database for 'add' operation
  if (params.operation === 'add') {
    // Get the current map
    const map = context.player.getCurrentMap?.();
    if (map) {
      const mapAny = map as any;
      const itemId = params.itemId;

      const existingItem = map.database()[itemId];
      
      if (!existingItem) {
        // Item not in map database, fetch from API
        try {
          // Get baseUrl from map context
          const apiBaseUrl = mapAny.apiBaseUrl;
          
          if (apiBaseUrl) {
            // Use public API endpoint: /game/database/:dataId
            const url = `${apiBaseUrl}/game/database/${itemId}`;
            const response = await fetch(url);
            
            if (response.ok) {
              const itemData = await response.json();
              
              if (itemData) {
                // Add item to map database
                map.addInDatabase(itemId, itemData);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch item ${params.itemId} from database:`, error);
          // Continue execution even if fetch fails - the item might still work
        }
      }
    }
  }
  
  switch (params.operation) {
    case 'add':
      context.player.addItem(params.itemId, amount);
      break;
    case 'remove':
      context.player.removeItem(params.itemId, amount);
      break;
  }
};
