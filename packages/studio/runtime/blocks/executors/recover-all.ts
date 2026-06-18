import { excludeTriggers } from '../context-helpers';
import type { BlockExecutor } from '../types';

export const schemaRecoverAll = {
  type: 'recover_all',
  label: 'Recover All',
  description: 'Restore HP and SP to full',
  category: 'character',
  icon: '💊',
  requiredCapabilities: ['player'],
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {}
  }
} as const;

export const recover_all: BlockExecutor<'recover_all'> = async (context) => {
  if (typeof context.player.allRecovery === 'function') {
    context.player.allRecovery();
    return;
  }
  if (typeof context.player.recovery === 'function') {
    context.player.recovery({ hp: 1, sp: 1 });
  }
};
