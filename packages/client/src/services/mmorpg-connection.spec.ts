import { describe, expect, test } from "vitest";
import { isNativeSocketEvent, parseSocketMessage, waitForRpgjsConnected } from "./mmorpg-connection";

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class FakeConnection extends EventTarget {
  serverMessage(data: any) {
    this.dispatchEvent(new MessageEvent("message", {
      data: typeof data === "string" ? data : JSON.stringify(data),
    }));
  }

  close(reason = "", code = 1008) {
    this.dispatchEvent(new CloseEvent("close", {
      code,
      reason,
    }));
  }

  fail(message = "WebSocket connection failed") {
    this.dispatchEvent(new ErrorEvent("error", {
      message,
    }));
  }
}

describe("MMORPG connection gate", () => {
  test("resolves only after the RPGJS connected packet", async () => {
    const conn = new FakeConnection();
    let resolved = false;
    const promise = waitForRpgjsConnected(conn).then(() => {
      resolved = true;
    });

    conn.serverMessage({ type: "sync", value: { pId: "player-1" } });
    await wait();

    expect(resolved).toBe(false);

    conn.serverMessage({ type: "connected", value: { id: "conn-1" } });
    await promise;

    expect(resolved).toBe(true);
  });

  test("rejects when the socket closes before the RPGJS connected packet", async () => {
    const conn = new FakeConnection();
    const promise = waitForRpgjsConnected(conn);

    conn.close("Authentication failed");

    await expect(promise).rejects.toThrow("Authentication failed");
  });

  test("can ignore the clean close emitted by PartySocket during manual reconnect", async () => {
    const conn = new FakeConnection();
    const promise = waitForRpgjsConnected(conn, 10000, { ignoreCleanClose: true });

    conn.close("", 1000);
    await wait();

    conn.serverMessage({ type: "connected", value: { id: "conn-2" } });

    await expect(promise).resolves.toBeUndefined();
  });

  test("can ignore PartySocket reconnect close events with non-string reasons", async () => {
    const conn = new FakeConnection();
    const promise = waitForRpgjsConnected(conn, 10000, { ignoreCleanClose: true });

    conn.dispatchEvent(new CloseEvent("close", {
      code: 1000,
      reason: new Event("close") as any,
    }));
    await wait();

    conn.serverMessage({ type: "connected", value: { id: "conn-3" } });

    await expect(promise).resolves.toBeUndefined();
  });

  test("rejects when the socket errors before the RPGJS connected packet", async () => {
    const conn = new FakeConnection();
    const promise = waitForRpgjsConnected(conn);

    conn.fail("Unauthorized");

    await expect(promise).rejects.toThrow("Unauthorized");
  });

  test("parses connection messages and detects native socket events", () => {
    expect(parseSocketMessage(JSON.stringify({ type: "connected" }))).toEqual({ type: "connected" });
    expect(parseSocketMessage("not-json")).toBeUndefined();
    expect(isNativeSocketEvent("open")).toBe(true);
    expect(isNativeSocketEvent("sync")).toBe(false);
  });
});
