import { skillSchema } from '@common/schemas/database';
import { excludeTriggers } from '../context-helpers';
import type { BlockExecutor } from '../types';

const skillField = {
  type: 'string',
  title: 'Skill',
  description: 'Select a skill from the database',
  $ref: '#/functions/skill',
  format: {
    add: {
      schema: skillSchema,
    },
  },
} as const;

export const schemaChangeSkill = {
  type: 'change_skill',
  label: 'Change Skill',
  description: 'Teach or remove a skill from the player',
  category: 'character',
  icon: '📘',
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {
      skillId: skillField,
      state: {
        type: 'string',
        title: 'State',
        description: 'Whether the player should learn or forget this skill',
        enum: ['learn', 'forget'],
        default: 'learn',
        format: {
          labels: ['Learn', 'Forget'],
        },
      },
    },
    required: ['skillId', 'state'],
  },
} as const;

export const schemaUseSkill = {
  type: 'use_skill',
  label: 'Use Skill',
  description: 'Use one of the player skills',
  category: 'character',
  icon: '✨',
  contextCondition: excludeTriggers('onInit'),
  schema: {
    type: 'object',
    properties: {
      skillId: skillField,
    },
    required: ['skillId'],
  },
} as const;

function runSkillCommand(player: any, method: 'learnSkill' | 'forgetSkill' | 'useSkill', skillId: string) {
  if (!skillId) {
    return;
  }
  if (typeof player?.[method] !== 'function') {
    throw new Error(`Player does not support ${method}`);
  }
  return player[method](skillId);
}

export const change_skill: BlockExecutor<'change_skill'> = async (context, params) => {
  const method = params.state === 'forget' ? 'forgetSkill' : 'learnSkill';
  await runSkillCommand(context.player, method, params.skillId);
};

export const use_skill: BlockExecutor<'use_skill'> = async (context, params) => {
  await runSkillCommand(context.player, 'useSkill', params.skillId);
};
