import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SaveClientService, provideSaveClient } from "./save";

const createSocket = () => {
  const listeners = new Map<string, (data: any) => void>();
  const emitted: Array<{ event: string; data: any }> = [];

  return {
    listeners,
    emitted,
    on: vi.fn((event: string, callback: (data: any) => void) => {
      listeners.set(event, callback);
    }),
    off: vi.fn((event: string) => {
      listeners.delete(event);
    }),
    emit: vi.fn((event: string, data: any) => {
      emitted.push({ event, data });
    }),
  };
};

const createService = (socket = createSocket()) => {
  const service = Object.create(SaveClientService.prototype) as SaveClientService;
  (service as any).webSocket = socket;
  (service as any).pending = new Map();
  (service as any).requestCounter = 0;
  return { service, socket };
};

describe("SaveClientService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("registers save result listeners idempotently", () => {
    const { service, socket } = createService();

    service.initialize();

    expect(socket.off).toHaveBeenCalledTimes(4);
    expect(socket.on).toHaveBeenCalledTimes(4);
    expect([...socket.listeners.keys()]).toEqual([
      "save.list.result",
      "save.save.result",
      "save.load.result",
      "save.error",
    ]);
  });

  test("lists, saves and loads slots through request/response events", async () => {
    const { service, socket } = createService();
    service.initialize();

    const listPromise = service.listSlots();
    expect(socket.emitted[0]).toEqual({
      event: "save.list",
      data: { requestId: "1767323045000-1" },
    });
    socket.listeners.get("save.list.result")?.({
      requestId: "1767323045000-1",
      slots: [{ id: "slot-a" }],
    });
    await expect(listPromise).resolves.toEqual([{ id: "slot-a" }]);

    const savePromise = service.saveSlot(2, { map: "forest" } as any);
    expect(socket.emitted[1]).toEqual({
      event: "save.save",
      data: {
        requestId: "1767323045000-2",
        index: 2,
        meta: { map: "forest" },
      },
    });
    socket.listeners.get("save.save.result")?.({
      requestId: "1767323045000-2",
      index: 2,
      slots: [null, null, { id: "slot-c" }],
    });
    await expect(savePromise).resolves.toEqual([null, null, { id: "slot-c" }]);

    const loadPromise = service.loadSlot(2);
    expect(socket.emitted[2]).toEqual({
      event: "save.load",
      data: { requestId: "1767323045000-3", index: 2 },
    });
    socket.listeners.get("save.load.result")?.({
      requestId: "1767323045000-3",
      index: 2,
      ok: true,
    });
    await expect(loadPromise).resolves.toBe(true);
  });

  test("rejects matching pending requests on save errors and ignores stale responses", async () => {
    const { service, socket } = createService();
    service.initialize();

    const listPromise = service.listSlots();

    socket.listeners.get("save.list.result")?.({
      requestId: "unknown",
      slots: [{ id: "stale" }],
    });
    expect((service as any).pending.size).toBe(1);

    socket.listeners.get("save.error")?.({
      requestId: "1767323045000-1",
      message: "Cannot save",
    });

    await expect(listPromise).rejects.toThrow("Cannot save");
    expect((service as any).pending.size).toBe(0);
  });

  test("provides the client save service class", () => {
    expect(provideSaveClient()).toEqual({
      provide: SaveClientService,
      useClass: SaveClientService,
    });
  });
});
