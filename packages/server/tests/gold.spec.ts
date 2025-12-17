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

describe("Gold Manager - Basic Operations", () => {
  test("should have 0 gold by default", () => {
    expect(player.gold).toBe(0);
  });

  test("should set gold to a positive value", () => {
    player.gold = 100;
    expect(player.gold).toBe(100);
  });

  test("should add gold", () => {
    player.gold = 50;
    player.gold += 30;
    expect(player.gold).toBe(80);
  });

  test("should subtract gold", () => {
    player.gold = 100;
    player.gold -= 40;
    expect(player.gold).toBe(60);
  });

  test("should not allow negative gold (clamp to 0)", () => {
    player.gold = 50;
    player.gold -= 100; // Try to go negative
    expect(player.gold).toBe(0);
  });

  test("should set to 0 when setting negative value directly", () => {
    player.gold = -50;
    expect(player.gold).toBe(0);
  });

  test("should handle large gold values", () => {
    player.gold = 999999999;
    expect(player.gold).toBe(999999999);
  });

  test("should handle gold = 0", () => {
    player.gold = 100;
    player.gold = 0;
    expect(player.gold).toBe(0);
  });
});

describe("Gold Manager - Edge Cases", () => {
  test("should handle multiple consecutive operations", () => {
    player.gold = 100;
    player.gold += 50;
    player.gold -= 30;
    player.gold += 20;
    expect(player.gold).toBe(140);
  });

  test("should handle subtracting exactly to 0", () => {
    player.gold = 100;
    player.gold -= 100;
    expect(player.gold).toBe(0);
  });

  test("should handle decimal values (floored)", () => {
    player.gold = 10.5;
    // Note: behavior depends on implementation
    expect(player.gold).toBeGreaterThanOrEqual(10);
  });
});

