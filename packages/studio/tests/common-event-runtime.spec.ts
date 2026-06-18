import { describe, expect, test, vi } from "vitest";
import { EventMode } from "@rpgjs/server";
import { call_common_event, spawn_common_event } from "../runtime/blocks/executors/common-event";
import { BlockExecutionService } from "../src/block-executor";

describe("Studio common event runtime blocks", () => {
  test("call_common_event executes the selected event workflow with recursion guard", async () => {
    const executeSetVariable = vi.fn();
    const context = {
      getCommonEvent: vi.fn(async () => ({
        _id: "common_event_1",
        triggers: [
          {
            type: "onAction",
            enabled: true,
            blocks: [
              {
                id: "block_1",
                type: "set_variable",
                data: { variableId: "quest_state", operation: "set", value: "1" },
              },
            ],
          },
        ],
      })),
      executors: {
        set_variable: executeSetVariable,
      },
    } as any;

    await call_common_event(context, {
      commonEventId: "common_event_1",
      maxDepth: 2,
      parameters: { source: "test" },
    });

    expect(context.getCommonEvent).toHaveBeenCalledWith("common_event_1");
    expect(executeSetVariable).toHaveBeenCalledWith(
      expect.objectContaining({
        commonEventExecutionState: {
          depth: 1,
          parameters: { source: "test" },
        },
      }),
      { variableId: "quest_state", operation: "set", value: "1" },
    );
  });

  test("spawn_common_event resolves fixed, player, event, and variable positions", async () => {
    const context = {
      getCommonEvent: vi.fn(async () => ({ _id: "common_event_1", name: "Chest" })),
      getVariable: vi.fn((id: string) => id === "spawn_x" ? 32 : 48),
      spawnCommonEvent: vi.fn(async () => undefined),
      player: {
        x: () => 12,
        y: () => 16,
      },
      event: {
        x: () => 18,
        y: () => 24,
      },
    } as any;

    await spawn_common_event(context, {
      commonEventId: "common_event_1",
      positionMode: "fixed",
      position: { x: 7, y: 11 },
    });
    await spawn_common_event(context, {
      commonEventId: "common_event_1",
      positionMode: "player",
    });
    await spawn_common_event(context, {
      commonEventId: "common_event_1",
      positionMode: "current_event",
    });
    await spawn_common_event(context, {
      commonEventId: "common_event_1",
      positionMode: "variable",
      positionVariableXId: "spawn_x",
      positionVariableYId: "spawn_y",
      mode: "scenario",
    });

    expect(context.spawnCommonEvent).toHaveBeenNthCalledWith(
      1,
      "common_event_1",
      { x: 7, y: 11 },
      { mode: "shared" },
    );
    expect(context.spawnCommonEvent).toHaveBeenNthCalledWith(
      2,
      "common_event_1",
      { x: 12, y: 16 },
      { mode: "shared" },
    );
    expect(context.spawnCommonEvent).toHaveBeenNthCalledWith(
      3,
      "common_event_1",
      { x: 18, y: 24 },
      { mode: "shared" },
    );
    expect(context.spawnCommonEvent).toHaveBeenNthCalledWith(
      4,
      "common_event_1",
      { x: 32, y: 48 },
      { mode: "scenario" },
    );
  });

  test("BlockExecutionService spawns a mapped common event through RPGJS createDynamicEvent", async () => {
    const createDynamicEvent = vi.fn(async () => "spawned-event");
    const commonEvent = {
      _id: "common_event_1",
      name: "Chest",
      eventType: "character",
      params: { graphic: "chest" },
      triggers: [{ type: "onAction", enabled: true, blocks: [] }],
    };
    const map = {
      scale: 2,
      __studioCommonEventsById: new Map([["common_event_1", commonEvent]]),
      createDynamicEvent,
    };
    const player = {
      id: "player_1",
      getCurrentMap: () => map,
    };
    const event = {
      getCurrentMap: () => map,
    };
    const service = new BlockExecutionService(player as any, event as any);
    const context = service.getContext();

    expect(context.getCommonEvent?.("common_event_1")).toBe(commonEvent);

    await context.spawnCommonEvent?.("common_event_1", { x: 40, y: 60 }, { mode: "scenario" });

    expect(createDynamicEvent).toHaveBeenCalledTimes(1);
    expect(createDynamicEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "common_event_1",
        sourceEventId: "common_event_1",
        x: 20,
        y: 30,
        position: expect.objectContaining({ x: 20, y: 30 }),
        eventId: expect.stringMatching(/^common_event_1_spawn_/),
      }),
      {
        mode: EventMode.Scenario,
        scenarioOwnerId: "player_1",
      },
    );
  });

  test("BlockExecutionService executes map entry blocks with player and map context", async () => {
    const setWeather = vi.fn();
    const showText = vi.fn(async () => undefined);
    const map = {
      getWeather: () => null,
      setWeather,
    };
    const player = {
      showText,
      getCurrentMap: () => map,
    };
    const service = new BlockExecutionService(player as any, null, map as any);

    await service.executeBlockSequence([
      {
        id: "text",
        type: "show_text",
        data: {
          text: "Welcome",
        },
      } as any,
      {
        id: "weather",
        type: "set_weather",
        data: {
          effect: "rain",
          preset: "lightRain",
        },
      } as any,
    ]);

    expect(showText).toHaveBeenCalledWith("Welcome", {
      talkWith: undefined,
      position: undefined,
      face: undefined,
    });
    expect(setWeather).toHaveBeenCalledWith(
      expect.objectContaining({
        effect: "rain",
        preset: "lightRain",
      }),
      { sync: undefined },
    );
  });
});
