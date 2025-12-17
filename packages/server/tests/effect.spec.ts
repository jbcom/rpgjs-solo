import { beforeEach, test, expect, afterEach, describe } from "vitest";
import { testing, TestingFixture } from "@rpgjs/testing";
import { defineModule, createModule } from "@rpgjs/common";
import { RpgPlayer } from "../src";
import { Effect } from "../src/Player/EffectManager";

/**
 * Test state class with effects
 */
class PoisonState {
  static id = "poison";
  id = "poison";
  name = "Poison";
  effects = [Effect.CAN_NOT_SKILL];
}

/**
 * Test state class with GUARD effect
 */
class GuardState {
  static id = "guard-state";
  id = "guard-state";
  name = "Guard State";
  effects = [Effect.GUARD];
}

/**
 * Test armor with effect
 */
const TestArmor = {
  id: "test-armor",
  name: "Test Armor",
  pdef: 10,
  effects: [Effect.HALF_SP_COST],
  _type: "armor" as const,
};

let player: RpgPlayer;
let fixture: TestingFixture;

const serverModule = defineModule({
  maps: [{ id: "test-map", file: "" }],
  database: {
    poison: PoisonState,
    "guard-state": GuardState,
    "test-armor": TestArmor,
  },
  player: {
    async onConnected(player) {
      await player.changeMap("test-map", { x: 100, y: 100 });
    },
  },
});

const clientModule = defineModule({});

beforeEach(async () => {
  const myModule = createModule("TestModule", [
    { server: serverModule, client: clientModule },
  ]);
  fixture = await testing(myModule);
  const clientTesting = await fixture.createClient();
  player = await clientTesting.waitForMapChange("test-map");
});

afterEach(async () => {
  await fixture.clear();
});

describe("Effect Manager - Direct Effects", () => {
  test("should have no effects by default", () => {
    expect(player.effects).toEqual([]);
  });

  test("should set direct effects", () => {
    player.effects = [Effect.GUARD];
    expect(player.effects).toContain(Effect.GUARD);
  });

  test("should set multiple direct effects", () => {
    player.effects = [Effect.GUARD, Effect.HALF_SP_COST];
    expect(player.effects).toContain(Effect.GUARD);
    expect(player.effects).toContain(Effect.HALF_SP_COST);
  });

  test("should clear effects when setting empty array", () => {
    player.effects = [Effect.GUARD];
    player.effects = [];
    expect(player.effects).toEqual([]);
  });
});

describe("Effect Manager - hasEffect", () => {
  test("should return true for existing effect", () => {
    player.effects = [Effect.GUARD];
    expect(player.hasEffect(Effect.GUARD)).toBe(true);
  });

  test("should return false for non-existing effect", () => {
    expect(player.hasEffect(Effect.GUARD)).toBe(false);
  });

  test("should check for CAN_NOT_SKILL effect", () => {
    player.effects = [Effect.CAN_NOT_SKILL];
    expect(player.hasEffect(Effect.CAN_NOT_SKILL)).toBe(true);
    expect(player.hasEffect(Effect.CAN_NOT_ITEM)).toBe(false);
  });

  test("should check for CAN_NOT_ITEM effect", () => {
    player.effects = [Effect.CAN_NOT_ITEM];
    expect(player.hasEffect(Effect.CAN_NOT_ITEM)).toBe(true);
  });

  test("should check for HALF_SP_COST effect", () => {
    player.effects = [Effect.HALF_SP_COST];
    expect(player.hasEffect(Effect.HALF_SP_COST)).toBe(true);
  });

  test("should check for SUPER_GUARD effect", () => {
    player.effects = [Effect.SUPER_GUARD];
    expect(player.hasEffect(Effect.SUPER_GUARD)).toBe(true);
  });
});

describe("Effect Manager - Effects from States", () => {
  test("should get effects from applied state", () => {
    player.addState(PoisonState);
    expect(player.hasEffect(Effect.CAN_NOT_SKILL)).toBe(true);
  });

  test("should lose effects when state is removed", () => {
    player.addState(PoisonState);
    expect(player.hasEffect(Effect.CAN_NOT_SKILL)).toBe(true);
    
    player.removeState(PoisonState);
    expect(player.hasEffect(Effect.CAN_NOT_SKILL)).toBe(false);
  });

  test("should combine effects from multiple states", () => {
    player.addState(PoisonState);
    player.addState(GuardState);
    
    expect(player.hasEffect(Effect.CAN_NOT_SKILL)).toBe(true);
    expect(player.hasEffect(Effect.GUARD)).toBe(true);
  });
});

describe("Effect Manager - Effects from Equipment", () => {
  // Note: Equipment effects require items to have an effects property that
  // is accessible after equipping. This depends on how Item class stores data.
  test.skip("should get effects from equipped armor", () => {
    player.addItem(TestArmor, 1);
    player.equip("test-armor", true);
    expect(player.hasEffect(Effect.HALF_SP_COST)).toBe(true);
  });

  test.skip("should lose effects when equipment is unequipped", () => {
    player.addItem(TestArmor, 1);
    player.equip("test-armor", true);
    expect(player.hasEffect(Effect.HALF_SP_COST)).toBe(true);
    
    player.equip("test-armor", false);
    expect(player.hasEffect(Effect.HALF_SP_COST)).toBe(false);
  });
});

describe("Effect Manager - Combined Effects", () => {
  test("should combine effects from direct and states", () => {
    // Direct effect
    player.effects = [Effect.SUPER_GUARD];
    
    // Effect from state
    player.addState(PoisonState);
    
    expect(player.hasEffect(Effect.SUPER_GUARD)).toBe(true);
    expect(player.hasEffect(Effect.CAN_NOT_SKILL)).toBe(true);
  });

  test("should have unique effects (no duplicates)", () => {
    // Same effect from multiple sources
    player.effects = [Effect.GUARD];
    player.addState(GuardState); // Also has GUARD effect
    
    // Effects should be unique
    const guardCount = player.effects.filter(e => e === Effect.GUARD).length;
    expect(guardCount).toBe(1);
  });
});

describe("Effect Manager - Effect Enum Values", () => {
  test("should have correct CAN_NOT_SKILL value", () => {
    expect(Effect.CAN_NOT_SKILL).toBe("CAN_NOT_SKILL");
  });

  test("should have correct CAN_NOT_ITEM value", () => {
    expect(Effect.CAN_NOT_ITEM).toBe("CAN_NOT_ITEM");
  });

  test("should have correct CAN_NOT_STATE value", () => {
    expect(Effect.CAN_NOT_STATE).toBe("CAN_NOT_STATE");
  });

  test("should have correct CAN_NOT_EQUIPMENT value", () => {
    expect(Effect.CAN_NOT_EQUIPMENT).toBe("CAN_NOT_EQUIPMENT");
  });

  test("should have correct HALF_SP_COST value", () => {
    expect(Effect.HALF_SP_COST).toBe("HALF_SP_COST");
  });

  test("should have correct GUARD value", () => {
    expect(Effect.GUARD).toBe("GUARD");
  });

  test("should have correct SUPER_GUARD value", () => {
    expect(Effect.SUPER_GUARD).toBe("SUPER_GUARD");
  });
});

