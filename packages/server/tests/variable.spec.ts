import { beforeEach, test, expect, afterEach, describe } from "vitest";
import { testing, TestingFixture } from "@rpgjs/testing";
import { defineModule, createModule } from "@rpgjs/common";
import { RpgPlayer } from "../src";

let player: RpgPlayer;
let fixture: TestingFixture;

const serverModule = defineModule({
  maps: [{ id: "test-map", file: "" }],
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

describe("Variable Manager - setVariable and getVariable", () => {
  test("should set and get a string variable", () => {
    player.setVariable("name", "John");
    expect(player.getVariable("name")).toBe("John");
  });

  test("should set and get a number variable", () => {
    player.setVariable("score", 100);
    expect(player.getVariable("score")).toBe(100);
  });

  test("should set and get a boolean variable", () => {
    player.setVariable("questCompleted", true);
    expect(player.getVariable("questCompleted")).toBe(true);
  });

  test("should set and get an object variable", () => {
    const questData = { id: 1, progress: 50 };
    player.setVariable("currentQuest", questData);
    expect(player.getVariable("currentQuest")).toEqual(questData);
  });

  test("should set and get an array variable", () => {
    const inventory = ["sword", "shield", "potion"];
    player.setVariable("inventory", inventory);
    expect(player.getVariable("inventory")).toEqual(inventory);
  });

  test("should return undefined for non-existent variable", () => {
    expect(player.getVariable("nonExistent")).toBeUndefined();
  });

  test("should overwrite existing variable", () => {
    player.setVariable("score", 100);
    player.setVariable("score", 200);
    expect(player.getVariable("score")).toBe(200);
  });
});

describe("Variable Manager - hasVariable", () => {
  test("should return true for existing variable", () => {
    player.setVariable("exists", true);
    expect(player.hasVariable("exists")).toBe(true);
  });

  test("should return false for non-existing variable", () => {
    expect(player.hasVariable("notExists")).toBe(false);
  });

  test("should return true even for null or undefined values", () => {
    player.setVariable("nullVar", null);
    expect(player.hasVariable("nullVar")).toBe(true);

    player.setVariable("undefinedVar", undefined);
    expect(player.hasVariable("undefinedVar")).toBe(true);
  });
});

describe("Variable Manager - removeVariable", () => {
  test("should remove an existing variable", () => {
    player.setVariable("toRemove", "value");
    const result = player.removeVariable("toRemove");
    expect(result).toBe(true);
    expect(player.hasVariable("toRemove")).toBe(false);
  });

  test("should return false when removing non-existing variable", () => {
    const result = player.removeVariable("notExists");
    expect(result).toBe(false);
  });

  test("should allow re-adding removed variable", () => {
    player.setVariable("temp", "first");
    player.removeVariable("temp");
    player.setVariable("temp", "second");
    expect(player.getVariable("temp")).toBe("second");
  });
});

describe("Variable Manager - getVariableKeys", () => {
  test("should return empty array when no variables", () => {
    expect(player.getVariableKeys()).toEqual([]);
  });

  test("should return all variable keys", () => {
    player.setVariable("key1", "value1");
    player.setVariable("key2", "value2");
    player.setVariable("key3", "value3");

    const keys = player.getVariableKeys();
    expect(keys).toContain("key1");
    expect(keys).toContain("key2");
    expect(keys).toContain("key3");
    expect(keys.length).toBe(3);
  });

  test("should not include removed keys", () => {
    player.setVariable("key1", "value1");
    player.setVariable("key2", "value2");
    player.removeVariable("key1");

    const keys = player.getVariableKeys();
    expect(keys).not.toContain("key1");
    expect(keys).toContain("key2");
  });
});

describe("Variable Manager - clearVariables", () => {
  test("should clear all variables", () => {
    player.setVariable("key1", "value1");
    player.setVariable("key2", "value2");
    player.setVariable("key3", "value3");

    player.clearVariables();

    expect(player.getVariableKeys()).toEqual([]);
    expect(player.hasVariable("key1")).toBe(false);
    expect(player.hasVariable("key2")).toBe(false);
    expect(player.hasVariable("key3")).toBe(false);
  });

  test("should allow adding variables after clear", () => {
    player.setVariable("old", "oldValue");
    player.clearVariables();
    player.setVariable("new", "newValue");

    expect(player.getVariable("old")).toBeUndefined();
    expect(player.getVariable("new")).toBe("newValue");
  });
});

describe("Variable Manager - Type Safety", () => {
  test("should preserve type when getting typed variable", () => {
    player.setVariable("count", 42);
    const count = player.getVariable<number>("count");
    expect(typeof count).toBe("number");
    expect(count).toBe(42);
  });

  test("should work with complex nested objects", () => {
    const complexData = {
      player: {
        stats: { hp: 100, mp: 50 },
        inventory: [{ id: 1, name: "sword" }],
      },
      timestamp: Date.now(),
    };
    player.setVariable("gameState", complexData);
    const retrieved = player.getVariable<typeof complexData>("gameState");
    expect(retrieved).toEqual(complexData);
  });
});

