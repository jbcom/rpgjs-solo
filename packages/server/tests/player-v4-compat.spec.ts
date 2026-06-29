import { describe, expect, test, vi } from "vitest";
import { RpgPlayer } from "../src";

describe("RpgPlayer v4 compatibility helpers", () => {
  test("name proxies the private synchronized name signal", () => {
    const player = new RpgPlayer();

    player.name = "Hero";

    expect(player.name).toBe("Hero");
    expect(player._name()).toBe("Hero");
  });

  test("speed and canMove proxy their private synchronized signals", () => {
    const player = new RpgPlayer();

    player.speed = 7;
    player.canMove = false;

    expect(player.speed).toBe(7);
    expect(player._speed()).toBe(7);
    expect(player.canMove).toBe(false);
    expect(player._canMove()).toBe(false);
  });

  test("position proxies x, y and z signals", () => {
    const player = new RpgPlayer();

    player.position = { x: 10, y: 20, z: 2 };

    expect(player.position).toEqual({ x: 10, y: 20, z: 2 });
  });

  test("createDynamicEvent delegates to the current map", async () => {
    const player = new RpgPlayer();
    const createDynamicEvent = vi.fn().mockResolvedValue("event-1");
    player.map = { createDynamicEvent } as any;

    await expect(player.createDynamicEvent({ x: 1, y: 2, event: {} })).resolves.toBe("event-1");
    expect(createDynamicEvent).toHaveBeenCalledWith({ x: 1, y: 2, event: {} });
  });

  test("setSizes maps legacy size data to the hitbox", () => {
    const player = new RpgPlayer();

    player.setSizes({ width: 40, height: 50, hitbox: { width: 20, height: 30 } });

    expect(player.hitbox()).toEqual({ w: 20, h: 30 });

    player.setSizes("width", 24);
    expect(player.hitbox()).toEqual({ w: 24, h: 30 });

    player.setSizes("height", 28);
    expect(player.hitbox()).toEqual({ w: 24, h: 28 });

    player.setSizes("hitbox", { width: 12, height: 14 });
    expect(player.hitbox()).toEqual({ w: 12, h: 14 });
  });

  test("setHitbox refreshes map physics without forcing a sync cycle", () => {
    const player = new RpgPlayer();
    player.id = "event-1";
    player.position = { x: 10, y: 20 };
    const map = {
      physic: {},
      updateHitbox: vi.fn(),
      syncChanges: vi.fn(),
    };
    player.map = map as any;

    player.setHitbox(60, 50);

    expect(player.hitbox()).toEqual({ w: 60, h: 50 });
    expect(map.updateHitbox).toHaveBeenCalledWith("event-1", 10, 20, 60, 50);
    expect(map.syncChanges).not.toHaveBeenCalled();
  });

  test("getTile and tiles use Tiled data when available", () => {
    const player = new RpgPlayer();
    const getTileByPosition = vi.fn((x: number, y: number) => ({ x, y, hasCollision: true }));
    player.map = {
      tiled: {
        tilewidth: 16,
        tileheight: 16,
        getTileByPosition,
      },
    } as any;
    player.setHitbox(20, 20);
    player.position = { x: 8, y: 8 };

    expect(player.getTile(16, 16)).toEqual({ x: 16, y: 16, hasCollision: true });
    expect(player.tiles).toHaveLength(4);
  });

  test("otherPlayersCollision resolves player and event instances from collision ids", () => {
    const player = new RpgPlayer();
    const otherPlayer = new RpgPlayer();
    const event = new RpgPlayer();
    player.map = {
      getCollisions: vi.fn(() => ["player-2", "event-1", "missing"]),
      getPlayer: vi.fn((id: string) => (id === "player-2" ? otherPlayer : undefined)),
      getEvent: vi.fn((id: string) => (id === "event-1" ? event : undefined)),
    } as any;

    expect(player.otherPlayersCollision).toEqual([otherPlayer, event]);
  });

  test("save without arguments returns a v4-style JSON snapshot and load accepts it", async () => {
    const player = new RpgPlayer();
    player.name = "Saved Hero";
    player.speed = 6;
    player.canMove = false;
    player.position = { x: 12, y: 34, z: 1 };

    const snapshot = await player.save();
    const data = JSON.parse(snapshot);
    expect(data.name).toBe("Saved Hero");
    expect(data.speed).toBe(6);
    expect(data.canMove).toBe(false);

    const restored = new RpgPlayer();
    await restored.load(snapshot);

    expect(restored.name).toBe("Saved Hero");
    expect(restored.speed).toBe(6);
    expect(restored.canMove).toBe(false);
    expect(restored.position).toEqual({ x: 12, y: 34, z: 1 });
  });

  test("load maps legacy snapshots to private synchronized signals", async () => {
    const player = new RpgPlayer();

    await player.load({ name: "Legacy Hero", speed: 8, canMove: false, x: 5, y: 6, z: 0 });

    expect(player.name).toBe("Legacy Hero");
    expect(player._name()).toBe("Legacy Hero");
    expect(player.speed).toBe(8);
    expect(player._speed()).toBe(8);
    expect(player.canMove).toBe(false);
    expect(player._canMove()).toBe(false);
  });

  test("playSound supports the legacy all-map boolean", () => {
    const player = new RpgPlayer();
    const playSound = vi.fn();
    const $send = vi.fn();
    player.map = { playSound, $send } as any;
    player.conn = {} as any;

    player.playSound("bell", true);
    expect(playSound).toHaveBeenCalledWith("bell");
    expect($send).not.toHaveBeenCalled();

    player.playSound("click", false);
    expect($send).toHaveBeenCalledWith(player.conn, {
      type: "playSound",
      value: { soundId: "click" },
    });
  });
});
