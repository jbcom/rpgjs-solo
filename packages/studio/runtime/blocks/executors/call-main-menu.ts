import { excludeTriggers } from '../context-helpers';
import type { BlockExecutor, CallMainMenuParams } from '../types';

export const schemaCallMainMenu = {
  type: 'call_main_menu',
  label: 'Call Main Menu',
  description: 'Open the main menu interface',
  category: 'scene',
  icon: '📋',
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {
      disabledSave: {
        type: 'boolean',
        title: 'Disabled Save',
        default: false
      },
    }
  }
} as const;

export const call_main_menu: BlockExecutor<'call_main_menu'> = async (context, params) => {
  const disabledSave = params.disabledSave ?? false;
  await context.player.callMainMenu({
    menus:  [
      {
        id: 'items',
        label: 'Items',
      },
      {
        id: 'equip',
        label: 'Equipment',
      },
      {
        id: 'save',
        label: 'Save',
        disabled: disabledSave,
      }
    ]
  });
};
