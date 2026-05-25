import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { testing, TestingFixture } from "@rpgjs/testing";
import { Control, createModule, defineModule, Direction } from "@rpgjs/common";
import { RpgClient } from "../../client/src";
import { RpgPlayer, RpgServer } from "../src";

let actionCount = 0;

const serverModule = defineModule<RpgServer>({
  maps: [
    {
      id: "interaction-map",
      file: "",
    },
  ],
  player: {
    async onConnected(player) {
      await player.changeMap("interaction-map", { x: 100, y: 100 });
    },
  },
});

const clientModule = defineModule<RpgClient>({});

let fixture: TestingFixture;
let client: any;
let player: RpgPlayer;

beforeEach(async () => {
  actionCount = 0;
  const myModule = createModule("ActionInteractionTestModule", [
    {
      server: serverModule,
      client: clientModule,
    },
  ]);

  fixture = await testing(myModule);
  client = await fixture.createClient();
  player = await client.waitForMapChange("interaction-map");
});

afterEach(async () => {
  await fixture.clear();
});

describe("Action interactions", () => {
  test("triggers onAction for an event just in front of the player", async () => {
    const map = player.getCurrentMap() as any;
    const hitbox = player.hitbox();

    await map.createDynamicEvent({
      id: "front-event",
      x: player.x(),
      y: player.y() + hitbox.h + 2,
      event: {
        onAction() {
          actionCount += 1;
        },
      },
    });
    await fixture.nextTick();

    player.changeDirection(Direction.Down);

    expect(map.getCollisions(player.id)).not.toContain("front-event");
    expect(map.getInteractionCollisions(player.id, Direction.Down)).toContain("front-event");

    map.onAction(player, { action: Control.Action });
    await fixture.wait(0);

    expect(actionCount).toBe(1);
  });

  test("ignores a nearby event behind the player", async () => {
    const map = player.getCurrentMap() as any;
    const hitbox = player.hitbox();

    await map.createDynamicEvent({
      id: "behind-event",
      x: player.x(),
      y: player.y() - hitbox.h - 2,
      event: {
        onAction() {
          actionCount += 1;
        },
      },
    });
    await fixture.nextTick();

    player.changeDirection(Direction.Down);
    map.onAction(player, { action: Control.Action });
    await fixture.wait(0);

    expect(actionCount).toBe(0);
  });

  test("ignores default action during GUI close cooldown", async () => {
    const map = player.getCurrentMap() as any;
    const hitbox = player.hitbox();

    await map.createDynamicEvent({
      id: "front-event",
      x: player.x(),
      y: player.y() + hitbox.h + 2,
      event: {
        onAction() {
          actionCount += 1;
        },
      },
    });
    await fixture.nextTick();

    player.changeDirection(Direction.Down);
    (player as any).__guiActionBlockUntil = Date.now() + 1000;

    map.onAction(player, { action: Control.Action });
    await fixture.wait(0);

    expect(actionCount).toBe(0);
  });

  test("dispatches custom action payloads to onInput without triggering event actions", async () => {
    const map = player.getCurrentMap() as any;
    const hitbox = player.hitbox();

    await map.createDynamicEvent({
      id: "front-event",
      x: player.x(),
      y: player.y() + hitbox.h + 2,
      event: {
        onAction() {
          actionCount += 1;
        },
      },
    });
    await fixture.nextTick();

    player.changeDirection(Direction.Down);

    const payload = {
      action: "projectile:shoot",
      data: {
        target: { x: 320, y: 180 },
      },
    };
    const execMethod = vi.spyOn(player as any, "execMethod");

    map.onAction(player, payload);
    await fixture.wait(0);

    expect(actionCount).toBe(0);
    expect(execMethod).toHaveBeenCalledWith("onInput", [payload]);

    execMethod.mockRestore();
  });
});
