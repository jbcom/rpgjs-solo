export const ACTION_BATTLE_I18N_KEYS = {
  feedbackBlock: "rpg.action-battle.feedback.block",
  feedbackParry: "rpg.action-battle.feedback.parry",
  feedbackMiss: "rpg.action-battle.feedback.miss",
  rewardCurrency: "rpg.action-battle.reward.currency",
  rewardNamedItemOne: "rpg.action-battle.reward.item.named.one",
  rewardNamedItemOther: "rpg.action-battle.reward.item.named.other",
  rewardItemOne: "rpg.action-battle.reward.item.one",
  rewardItemOther: "rpg.action-battle.reward.item.other",
} as const;

export const ACTION_BATTLE_CLIENT_I18N = {
  en: {
    [ACTION_BATTLE_I18N_KEYS.feedbackBlock]: "BLOCK",
    [ACTION_BATTLE_I18N_KEYS.feedbackParry]: "PARRY!",
    [ACTION_BATTLE_I18N_KEYS.feedbackMiss]: "MISS",
    [ACTION_BATTLE_I18N_KEYS.rewardCurrency]:
      "You won {experience} experience and {gold} gold",
    [ACTION_BATTLE_I18N_KEYS.rewardNamedItemOne]: "You won {count} {item}",
    [ACTION_BATTLE_I18N_KEYS.rewardNamedItemOther]:
      "You won {count} units of {item}",
    [ACTION_BATTLE_I18N_KEYS.rewardItemOne]: "You won {count} item",
    [ACTION_BATTLE_I18N_KEYS.rewardItemOther]: "You won {count} items",
  },
};
