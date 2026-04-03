import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { testing, type TestingFixture } from "@rpgjs/testing";
import { createModule, defineModule } from "@rpgjs/common";
import { RpgPlayer, RpgServer } from "../src";
import { RpgClient } from "../../client/src";

const serverModule = defineModule<RpgServer>({
  maps: [
    {
      id: "map1",
      file: "",
    },
  ],
  player: {
    async onConnected(player) {
      player.setVariable("chatCount", 0);
      player.setVariable("readyCount", 0);
      player.setVariable("lastMapMessage", null);

      player.on("chat:message", ({ text }) => {
        player.setVariable("chatCount", player.getVariable<number>("chatCount") + 1);
        player.setVariable("lastChatMessage", text);
      });

      player.once("chat:ready", ({ step }) => {
        player.setVariable("readyCount", player.getVariable<number>("readyCount") + 1);
        player.setVariable("lastReadyStep", step);
      });

      await player.changeMap("map1", { x: 100, y: 100 });
    },
    onJoinMap(player) {
      const map = player.getCurrentMap();
      map?.on("chat:message", (eventPlayer, data) => {
        player.setVariable("lastMapPlayerId", eventPlayer.id);
        player.setVariable("lastMapMessage", data.text);
      });
    },
  },
});

const clientModule = defineModule<RpgClient>({});

describe("Custom websocket bridge", () => {
  let chatCount = 0;
  let readyCount = 0;
  let lastChatMessage: string | null = null;
  let lastReadyStep: number | null = null;
  let lastMapMessage: string | null = null;
  let lastMapPlayerId: string | null = null;
  let fixture: TestingFixture;
  let client: Awaited<ReturnType<TestingFixture["createClient"]>>;
  let player: RpgPlayer;

  beforeEach(async () => {
    chatCount = 0;
    readyCount = 0;
    lastChatMessage = null;
    lastReadyStep = null;
    lastMapMessage = null;
    lastMapPlayerId = null;

    const module = createModule("CustomWebsocketModule", [{
      server: serverModule,
      client: clientModule,
    }]);

    fixture = await testing(module);
    client = await fixture.createClient();
    player = await client.waitForMapChange("map1");
  });

  afterEach(async () => {
    await fixture.clear();
  });

  test("player.on, player.once, map.on and map.broadcast bridge custom websocket events", async () => {
    player.off("chat:message");
    player.off("chat:ready");

    player.on("chat:message", ({ text }) => {
      chatCount++;
      lastChatMessage = text;
    });

    player.once("chat:ready", ({ step }) => {
      readyCount++;
      lastReadyStep = step;
    });

    player.getCurrentMap()?.on("chat:message", (eventPlayer, data) => {
      lastMapPlayerId = eventPlayer.id;
      lastMapMessage = data.text;
    });

    client.client.socket.emit("chat:message", { text: "hello" });
    client.client.socket.emit("chat:ready", { step: 1 });
    client.client.socket.emit("chat:ready", { step: 2 });
    await fixture.wait(0);

    expect(chatCount).toBe(1);
    expect(lastChatMessage).toBe("hello");
    expect(readyCount).toBe(1);
    expect(lastReadyStep).toBe(1);
    expect(lastMapPlayerId).toBe(player.id);
    expect(lastMapMessage).toBe("hello");

    player.off("chat:message");

    client.client.socket.emit("chat:message", { text: "ignored" });
    await fixture.wait(0);

    expect(chatCount).toBe(1);
    expect(lastChatMessage).toBe("hello");
    expect(lastMapMessage).toBe("ignored");

    const received = new Promise<any>((resolve) => {
      client.client.socket.on("server:notice", resolve);
    });

    player.getCurrentMap()?.broadcast("server:notice", {
      ok: true,
    });

    await expect(received).resolves.toMatchObject({ ok: true });
  });
});
