import type { ActionBattleAiIntent } from "./ai-behavior-tree";

const executionAcknowledgements = new WeakMap<
  ActionBattleAiIntent,
  () => void
>();

export const deferActionBattleAiIntentCompletion = (
  input: ActionBattleAiIntent | ActionBattleAiIntent[],
  complete: () => void
): boolean => {
  const intents = Array.isArray(input) ? input : [input];
  let deferred = false;
  for (const intent of intents) {
    if (intent.type !== "useAttack" && intent.type !== "useSkill") continue;
    executionAcknowledgements.set(intent, complete);
    deferred = true;
  }
  return deferred;
};

export const acknowledgeActionBattleAiIntentExecution = (
  intent: ActionBattleAiIntent
): void => {
  const acknowledge = executionAcknowledgements.get(intent);
  if (!acknowledge) return;
  executionAcknowledgements.delete(intent);
  acknowledge();
};
