import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { testing, type TestingFixture } from "@rpgjs/testing";
import { createModule, defineModule, Direction } from "@rpgjs/common";
import { RpgPlayer, RpgServer } from "../src";

const serverModule = defineModule<RpgServer>({
  maps: [
    {
      id: "test-map",
      file: "",
    },
  ],
  player: {
    async onConnected(player) {
      await player.changeMap("test-map", { x: 100, y: 100 });
    },
  },
});

let fixture: TestingFixture;
let client: any;
let player: RpgPlayer;
let serverMap: any;

beforeEach(async () => {
  const module = createModule("PredictionServerModule", [
    {
      server: serverModule,
    },
  ]);
  fixture = await testing(module);
  client = await fixture.createClient();
  player = await client.waitForMapChange("test-map");
  serverMap = fixture.server.subRoom as any;
});

afterEach(async () => {
  await fixture.clear();
});

describe("Prediction + Reconciliation Server Protocol", () => {
  test("should reply pong with server tick", () => {
    const emitSpy = vi.spyOn(player, "emit");
    const payload = {
      clientTime: 1234,
      clientFrame: 42,
    };

    serverMap.onPing(player, payload);

    expect(emitSpy).toHaveBeenCalledWith(
      "pong",
      expect.objectContaining({
        clientTime: payload.clientTime,
        clientFrame: payload.clientFrame,
        serverTick: serverMap.getTick(),
      }),
    );
  });

  test("should include authoritative ack metadata in sync interceptor", async () => {
    const frame = 7;
    await serverMap.onInput(player, {
      input: Direction.Right,
      frame,
      tick: 0,
      timestamp: Date.now(),
    });
    await serverMap.processInput(player.id);

    const intercepted = serverMap.interceptorPacket(
      player,
      { type: "sync", value: {} },
      player.conn,
    );

    expect(intercepted?.value?.ack).toEqual(
      expect.objectContaining({
        frame,
        serverTick: expect.any(Number),
        x: expect.any(Number),
        y: expect.any(Number),
        direction: expect.any(String),
      }),
    );
  });

  test("should align ack position with the synced local player payload when available", () => {
    player._lastFramePositions = {
      frame: 21,
      position: {
        x: 0,
        y: 0,
        direction: Direction.Down,
      },
      serverTick: 1,
    };

    const intercepted = serverMap.interceptorPacket(
      player,
      {
        type: "sync",
        value: {
          players: {
            [player.id]: {
              x: 321,
              y: 45,
              direction: Direction.Left,
            },
          },
        },
      },
      player.conn,
    );

    expect(intercepted?.value?.ack).toEqual(
      expect.objectContaining({
        frame: 21,
        x: 321,
        y: 45,
        direction: Direction.Left,
        serverTick: serverMap.getTick(),
      }),
    );
  });

  test("should queue trajectory frames and replay them progressively on server ticks", async () => {
    const baseTs = Date.now();
    await serverMap.onInput(player, {
      input: Direction.Right,
      frame: 3,
      tick: 3,
      timestamp: baseTs + 32,
      trajectory: [
        {
          input: Direction.Right,
          frame: 1,
          tick: 1,
          timestamp: baseTs,
          x: 101,
          y: 100,
          direction: Direction.Right,
        },
        {
          input: Direction.Right,
          frame: 2,
          tick: 2,
          timestamp: baseTs + 16,
          x: 102,
          y: 100,
          direction: Direction.Right,
        },
        {
          input: Direction.Right,
          frame: 3,
          tick: 3,
          timestamp: baseTs + 32,
          x: 103,
          y: 100,
          direction: Direction.Right,
        },
      ],
    });

    expect(player.pendingInputs.map((entry: any) => entry.frame)).toEqual([1, 2, 3]);

    await serverMap.processInput(player.id);
    expect(player._lastFramePositions?.frame).toBe(1);
    expect(player._lastFramePositions?.position?.x).toBe(101);
    expect(player.pendingInputs.map((entry: any) => entry.frame)).toEqual([2, 3]);

    await serverMap.processInput(player.id);
    expect(player._lastFramePositions?.frame).toBe(2);
    expect(player._lastFramePositions?.position?.x).toBe(102);
    expect(player.pendingInputs.map((entry: any) => entry.frame)).toEqual([3]);

    await serverMap.processInput(player.id);
    expect(player._lastFramePositions?.frame).toBe(3);
    expect(player._lastFramePositions?.position?.x).toBe(103);
    expect(player.pendingInputs).toHaveLength(0);
  });
});
