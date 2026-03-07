import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RpgServerEngine } from "../src/RpgServerEngine";
import {
  MAP_UPDATE_TOKEN_ENV,
  PartyConnection,
  createRpgServerTransport,
} from "../src/node";

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MockWebSocket {
  readyState = 1;
  sent: string[] = [];
  private handlers = new Map<string, Array<(...args: any[]) => void>>();

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }

  on(event: string, callback: (...args: any[]) => void): void {
    const listeners = this.handlers.get(event) || [];
    listeners.push(callback);
    this.handlers.set(event, listeners);
  }

  emit(event: string, ...args: any[]): void {
    for (const callback of this.handlers.get(event) || []) {
      callback(...args);
    }
  }
}

class MockServer extends RpgServerEngine {
  requests: Array<{ method: string; roomId: string; url: string; body: any }> = [];
  messages: Array<{ connectionId: string; message: string }> = [];
  closedConnections: string[] = [];
  connectedContexts: Array<{ connectionId: string; url: string }> = [];

  constructor(public room: any) {
    super();
  }

  async onRequest(req: any) {
    let body: any;
    try {
      body = await req.json();
    } catch {
      body = await req.text();
    }
    this.requests.push({
      method: req.method,
      roomId: this.room.id,
      url: req.url,
      body,
    });

    return {
      method: req.method,
      roomId: this.room.id,
      url: req.url,
      body,
    };
  }

  async onMessage(message: string, connection: any) {
    this.messages.push({
      connectionId: connection.id,
      message,
    });
  }

  async onConnect(connection: any, context: any) {
    this.connectedContexts.push({
      connectionId: connection.id,
      url: context.request.url,
    });
  }

  async onClose(connection: any) {
    this.closedConnections.push(connection.id);
  }
}

class RealServer extends RpgServerEngine {}

describe("createRpgServerTransport", () => {
  const originalMapUpdateToken = process.env[MAP_UPDATE_TOKEN_ENV];

  beforeEach(() => {
    PartyConnection.configurePacketLoss(false, 0);
    PartyConnection.configureBandwidth(false, 100);
    PartyConnection.configureLatency(false, 0);
    delete process.env[MAP_UPDATE_TOKEN_ENV];
  });

  afterEach(() => {
    if (typeof originalMapUpdateToken === "string") {
      process.env[MAP_UPDATE_TOKEN_ENV] = originalMapUpdateToken;
      return;
    }
    delete process.env[MAP_UPDATE_TOKEN_ENV];
  });

  it("handles fetch-style HTTP requests without Vite", async () => {
    const transport = createRpgServerTransport(MockServer as any, {
      initializeMaps: false,
    });

    const response = await transport.fetch("http://localhost/parties/main/lobby/echo?foo=bar", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ hello: "world" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      method: "POST",
      roomId: "lobby",
      url: "http://localhost/parties/main/lobby/echo?foo=bar",
      body: { hello: "world" },
    });
  });

  it("handles websocket connections without the Vite wrapper", async () => {
    const transport = createRpgServerTransport(MockServer as any, {
      initializeMaps: false,
    });
    const ws = new MockWebSocket();

    const handled = await transport.acceptWebSocket(ws as any, {
      url: "http://localhost/parties/main/lobby?_pk=player-1",
      method: "GET",
      headers: {
        host: "localhost",
      },
    });

    expect(handled).toBe(true);

    await wait(10);

    const server = transport.getServer("lobby") as MockServer;
    expect(server.connectedContexts).toEqual([
      {
        connectionId: "player-1",
        url: "http://localhost/parties/main/lobby?_pk=player-1",
      },
    ]);
    expect(JSON.parse(ws.sent[0])).toMatchObject({
      type: "connected",
      id: "player-1",
    });

    ws.emit("message", Buffer.from("ping"));
    await wait(10);

    expect(server.messages).toEqual([
      {
        connectionId: "player-1",
        message: "ping",
      },
    ]);

    ws.emit("close");
    await wait(10);

    expect(server.closedConnections).toEqual(["player-1"]);
  });

  it("rejects map/update in production when the token is missing", async () => {
    process.env[MAP_UPDATE_TOKEN_ENV] = "prod-secret";

    const transport = createRpgServerTransport(RealServer as any, {
      initializeMaps: false,
    });

    const response = await transport.fetch("http://localhost/parties/main/map-town/map/update", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "town",
        width: 320,
        height: 240,
        events: [],
      }),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: "Unauthorized map update",
    });
  });

  it("sends the configured token when transport.updateMap() is used", async () => {
    process.env[MAP_UPDATE_TOKEN_ENV] = "prod-secret";

    const transport = createRpgServerTransport(RealServer as any, {
      initializeMaps: false,
      mapUpdateToken: "prod-secret",
    });

    const response = await transport.updateMap("town", {
      id: "town",
      width: 320,
      height: 240,
      events: [],
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
