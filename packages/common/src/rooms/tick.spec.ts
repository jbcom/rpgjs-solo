import { describe, expect, test } from "vitest";
import { signal } from "@signe/reactive";
import { RpgCommonMap } from "./Map";

class TestMap extends RpgCommonMap<any> {
  players = signal({});
  events = signal({});

  run(deltaMs: number): number {
    return this.runFixedTicks(deltaMs);
  }

  async runAsync(deltaMs: number, hooks?: {
    beforeStep?: () => void | Promise<void>;
    afterStep?: (tick: number) => void | Promise<void>;
  }): Promise<number> {
    return this.runFixedTicksAsync(deltaMs, hooks);
  }

  setMaxSteps(value: number): void {
    this.maxFixedStepsPerTick = value;
  }
}

describe("RpgCommonMap fixed tick loop", () => {
  test("accumulates real delta and runs fixed physics steps", () => {
    const map = new TestMap();

    expect(map.run(10)).toBe(0);
    expect(map.getTick()).toBe(0);

    expect(map.run(10)).toBe(1);
    expect(map.getTick()).toBe(1);

    expect(map.run(70)).toBe(4);
    expect(map.getTick()).toBe(5);
  });

  test("caps catch-up work per tick and preserves remaining accumulated time", () => {
    const map = new TestMap();
    map.setMaxSteps(3);

    expect(map.run(250)).toBe(3);
    expect(map.getTick()).toBe(3);

    expect(map.run(1)).toBe(3);
    expect(map.getTick()).toBe(6);
  });

  test("runs async hooks around each fixed step in order", async () => {
    const map = new TestMap();
    const order: string[] = [];

    const executed = await map.runAsync(40, {
      beforeStep: async () => {
        order.push(`before:${map.getTick()}`);
      },
      afterStep: async (tick) => {
        order.push(`after:${tick}`);
      },
    });

    expect(executed).toBe(2);
    expect(order).toEqual(["before:0", "after:1", "before:1", "after:2"]);
  });
});
