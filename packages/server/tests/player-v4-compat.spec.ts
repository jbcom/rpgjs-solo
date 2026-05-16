import { describe, expect, test, vi } from "vitest";
import { RpgPlayer } from "../src";

describe("RpgPlayer v4 compatibility helpers", () => {
  test("name proxies the private synchronized name signal", () => {
    const player = new RpgPlayer();

    player.name = "Hero";

    expect(player.name).toBe("Hero");
    expect(player._name()).toBe("Hero");
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
});
