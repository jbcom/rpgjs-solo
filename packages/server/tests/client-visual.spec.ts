import { describe, expect, test, vi } from "vitest";
import { RpgPlayer } from "../src";
import { RpgMap } from "../src/rooms/map";

describe("client visual server helpers", () => {
  test("player.clientVisual sends one named visual to the current player", () => {
    const player = new RpgPlayer();
    const $send = vi.fn();
    player.map = { $send } as any;
    player.conn = {} as any;

    player.clientVisual("hit", {
      targetId: "enemy-1",
      damage: 12,
    });

    expect($send).toHaveBeenCalledWith(player.conn, {
      type: "clientVisual",
      value: {
        name: "hit",
        data: {
          targetId: "enemy-1",
          damage: 12,
        },
      },
    });
  });

  test("map.clientVisual broadcasts one named visual to the map", () => {
    const $broadcast = vi.fn();

    RpgMap.prototype.clientVisual.call(
      { $broadcast },
      "explosion",
      {
        position: { x: 10, y: 20 },
      }
    );

    expect($broadcast).toHaveBeenCalledWith({
      type: "clientVisual",
      value: {
        name: "explosion",
        data: {
          position: { x: 10, y: 20 },
        },
      },
    });
  });
});
