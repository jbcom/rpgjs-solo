import { beforeEach, describe, expect, it, vi } from "vitest";

const cloudflareMock = vi.hoisted(() => ({
  serverClass: undefined as (new (room: unknown) => any) | undefined,
}));

vi.mock("@signe/room/cloudflare", () => ({
  SigneRoomDurableObject: class {},
  createCloudflareRoomWorker(serverClass: new (room: unknown) => any) {
    cloudflareMock.serverClass = serverClass;
    return { fetch: vi.fn() };
  },
}));

import { createRpgServerWorker } from "../src/cloudflare/index";

describe("Cloudflare room transport", () => {
  beforeEach(() => {
    cloudflareMock.serverClass = undefined;
  });

  it("sends initial packets when an accepted Workerd socket still reports CONNECTING", async () => {
    class TestServer {
      async onConnect(connection: { send(data: string): void }): Promise<void> {
        connection.send("initial-sync");
      }
    }

    createRpgServerWorker(TestServer as any, {
      binding: "ROOMS",
      partiesPath: "/parties/main",
    });
    const rawSend = vi.fn();
    const guardedSend = vi.fn();
    const connection = {
      id: "player-1",
      rawWebSocket: { readyState: 0, send: rawSend },
      send: guardedSend,
    };
    const ServerClass = cloudflareMock.serverClass!;

    await new ServerClass({}).onConnect(connection, {});

    expect(guardedSend).not.toHaveBeenCalled();
    expect(rawSend).toHaveBeenNthCalledWith(1, "initial-sync");
    expect(JSON.parse(rawSend.mock.calls[1][0])).toMatchObject({
      type: "connected",
      id: "player-1",
    });
  });
});
