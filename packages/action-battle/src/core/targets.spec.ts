import { describe, expect, test } from "vitest";
import { RpgEvent } from "@rpgjs/server";
import { BattleAi } from "../ai.server";
import {
  canActionBattleTarget,
  getActionBattleEntityKind,
  getActionBattleFaction,
  getActionBattleTargets,
} from "./targets";

const player = (id: string, faction?: string) =>
  ({
    id,
    hp: 100,
    actionBattleFaction: faction,
  }) as any;

const battleEvent = (id: string, faction?: string) =>
  ({
    id,
    hp: 100,
    actionBattleFaction: faction,
    battleAi: {
      getFaction: () => faction,
      getTargets: () => "players",
    },
    attachShape() {},
  }) as any;

describe("action battle targets", () => {
  test("keeps player default targets on action battle events", () => {
    const attacker = player("player-1");
    const target = battleEvent("enemy-1", "enemies");

    expect(getActionBattleTargets(attacker, "events")).toBe("events");
    expect(canActionBattleTarget(attacker, target, "events")).toBe(true);
    expect(canActionBattleTarget(attacker, player("player-2"), "events")).toBe(false);
  });

  test("classifies runtime RpgEvent enemies before their RpgPlayer base class", () => {
    const attacker = player("player-1");
    const target = new RpgEvent() as any;
    target.id = "enemy-1";
    target.hp = 100;
    target.battleAi = {
      getFaction: () => "enemies",
      getTargets: () => "players",
    };

    expect(getActionBattleEntityKind(target)).toBe("event");
    expect(canActionBattleTarget(attacker, target, "events")).toBe(true);
    expect(canActionBattleTarget(attacker, target, "players")).toBe(false);
  });

  test("classifies runtime players with shape helpers as players", () => {
    const attacker = battleEvent("enemy-1", "enemies");
    const target = {
      ...player("player-1"),
      attachShape() {},
      isEvent: () => false,
    };

    expect(getActionBattleEntityKind(target as any)).toBe("player");
    expect(canActionBattleTarget(attacker, target as any, "players")).toBe(true);
  });

  test("supports player targets explicitly", () => {
    const attacker = player("player-1");
    const target = player("player-2");

    expect(canActionBattleTarget(attacker, target, "players")).toBe(true);
  });

  test("supports all targets", () => {
    const attacker = battleEvent("enemy-1", "enemies");

    expect(canActionBattleTarget(attacker, player("player-1"), "all")).toBe(true);
    expect(canActionBattleTarget(attacker, battleEvent("enemy-2", "enemies"), "all")).toBe(true);
  });

  test("supports hostile targets from different factions", () => {
    const guard = battleEvent("guard-1", "guards");
    const guardAlly = battleEvent("guard-2", "guards");
    const bandit = battleEvent("bandit-1", "bandits");

    expect(canActionBattleTarget(guard, guardAlly, "hostile")).toBe(false);
    expect(canActionBattleTarget(guard, bandit, "hostile")).toBe(true);
  });

  test("supports explicit faction target lists", () => {
    const guard = battleEvent("guard-1", "guards");
    const bandit = battleEvent("bandit-1", "bandits");
    const monster = battleEvent("monster-1", "monsters");

    expect(canActionBattleTarget(guard, bandit, ["bandits"])).toBe(true);
    expect(canActionBattleTarget(guard, monster, ["bandits"])).toBe(false);
  });

  test("BattleAi exposes runtime faction and targets", () => {
    const event = {
      id: "guard-1",
      hp: 100,
      param: {},
      attachShape: () => ({ id: "vision_guard-1" }),
      getCurrentMap: () => ({}),
      stopMoveTo() {},
    };
    const ai = new BattleAi(event as any, {
      faction: "guards",
      targets: ["bandits"],
    });

    expect(getActionBattleFaction(event as any)).toBe("guards");
    expect(getActionBattleTargets(event as any, "players")).toEqual(["bandits"]);

    ai.setFaction("bandits");
    ai.setTargets("hostile");

    expect(getActionBattleFaction(event as any)).toBe("bandits");
    expect(getActionBattleTargets(event as any, "players")).toBe("hostile");

    ai.destroy();
  });
});
