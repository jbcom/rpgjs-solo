import { afterEach, describe, expect, test, vi } from "vitest";
import { I18nService } from "@rpgjs/common";
import { createActionBattleClient } from "./client";
import { ACTION_BATTLE_I18N_KEYS } from "./i18n";

describe("action battle client attack recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("releases gameplay controls without interrupting a temporary attack animation", () => {
    vi.useFakeTimers();
    const resetAnimationState = vi.fn();
    const setAnimationName = vi.fn();
    const player = {
      animationFixed: false,
      canMove: true,
      directionFixed: false,
      getDirection: () => "down",
      changeDirection: vi.fn(),
      resetAnimationState,
      animationName: {
        set: setAnimationName,
      },
    };
    const engine = {
      scene: {
        getCurrentPlayer: () => player,
      },
      interruptCurrentPlayerMovement: vi.fn(),
    };
    const client = createActionBattleClient({
      attack: {
        lockDurationMs: 350,
      },
      visual: () => {},
      ui: {
        attackPreview: {
          enabled: false,
        },
      },
    });

    (client.engine?.onInput as any)(engine, {
      input: "action",
      data: {
        direction: "down",
      },
    });

    expect(player.animationFixed).toBe(true);

    vi.advanceTimersByTime(350);

    expect(player.animationFixed).toBe(false);
    expect(resetAnimationState).not.toHaveBeenCalled();
    expect(setAnimationName).not.toHaveBeenCalledWith("stand");
  });

  test("registers overridable framework combat feedback translations", () => {
    const client = createActionBattleClient();

    expect(client.i18n?.en).toMatchObject({
      "rpg.action-battle.feedback.block": "BLOCK",
      "rpg.action-battle.feedback.parry": "PARRY!",
      "rpg.action-battle.feedback.miss": "MISS",
      "rpg.action-battle.reward.currency":
        "You won {experience} experience and {gold} gold",
      "rpg.action-battle.reward.item.named.one": "You won {count} {item}",
      "rpg.action-battle.reward.item.named.other":
        "You won {count} units of {item}",
      "rpg.action-battle.reward.item.one": "You won {count} item",
      "rpg.action-battle.reward.item.other": "You won {count} items",
    });
  });

  test("interpolates English reward defaults and custom locale plural overrides", () => {
    const client = createActionBattleClient();
    const english = new I18nService({ messages: client.i18n });

    expect(
      english.t(ACTION_BATTLE_I18N_KEYS.rewardCurrency, {
        experience: 25,
        gold: 7,
      })
    ).toBe("You won 25 experience and 7 gold");
    expect(
      english.t(ACTION_BATTLE_I18N_KEYS.rewardNamedItemOne, {
        count: 1,
        item: "Potion",
      })
    ).toBe("You won 1 Potion");
    expect(
      english.t(ACTION_BATTLE_I18N_KEYS.rewardNamedItemOther, {
        count: 3,
        item: "Potion",
      })
    ).toBe("You won 3 units of Potion");
    expect(
      english.t(ACTION_BATTLE_I18N_KEYS.rewardItemOther, { count: 3 })
    ).toBe("You won 3 items");

    const spanish = new I18nService({
      defaultLocale: "es",
      fallbackLocale: "en",
      messages: {
        es: {
          [ACTION_BATTLE_I18N_KEYS.rewardCurrency]:
            "Ganaste {experience} de experiencia y {gold} de oro",
          [ACTION_BATTLE_I18N_KEYS.rewardNamedItemOne]:
            "Ganaste {count} {item}",
          [ACTION_BATTLE_I18N_KEYS.rewardNamedItemOther]:
            "Ganaste {count} unidades de {item}",
          [ACTION_BATTLE_I18N_KEYS.rewardItemOne]:
            "Ganaste {count} objeto",
          [ACTION_BATTLE_I18N_KEYS.rewardItemOther]:
            "Ganaste {count} objetos",
        },
      },
    });
    spanish.addMessages(client.i18n, "action-battle", 10);

    expect(
      spanish.t(ACTION_BATTLE_I18N_KEYS.rewardCurrency, {
        experience: 25,
        gold: 7,
      })
    ).toBe("Ganaste 25 de experiencia y 7 de oro");
    expect(
      spanish.t(ACTION_BATTLE_I18N_KEYS.rewardNamedItemOther, {
        count: 3,
        item: "Poción",
      })
    ).toBe("Ganaste 3 unidades de Poción");
    expect(
      spanish.t(ACTION_BATTLE_I18N_KEYS.rewardItemOther, { count: 3 })
    ).toBe("Ganaste 3 objetos");
  });
});
