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
});
