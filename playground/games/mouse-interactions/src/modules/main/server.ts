import { defineModule } from "@rpgjs/common";
import { Components, RpgPlayer, type EventDefinition, type RpgPlayerHooks, type RpgServer } from "@rpgjs/server";

const MAP_WIDTH = 720;
const MAP_HEIGHT = 480;
const TILE_SIZE = 32;
const CRATE_ID = "crate";
const TALK_DISTANCE = 96;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isPoint(value: any): value is { x: number; y: number } {
  return Number.isFinite(value?.x) && Number.isFinite(value?.y);
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function entityCenter(entity: any): { x: number; y: number } {
  const hitbox = typeof entity.hitbox === "function" ? entity.hitbox() : { w: 32, h: 32 };
  return {
    x: entity.x() + (hitbox.w ?? hitbox.width ?? 32) / 2,
    y: entity.y() + (hitbox.h ?? hitbox.height ?? 32) / 2,
  };
}

function Guard(): EventDefinition {
  return {
    name: "Guard",
    onInit() {
      this.name = "Guard";
      this.setHitbox(34, 42);
      this.setComponentsTop([
        Components.text("Guard"),
      ]);
    },
  };
}

function Chest(): EventDefinition {
  return {
    name: "Chest",
    onInit() {
      this.name = "Chest";
      this.setHitbox(38, 28);
      this.setComponentsTop([
        Components.text("Chest"),
      ]);
    },
  };
}

function Crate(): EventDefinition {
  return {
    name: "Crate",
    onInit() {
      this.name = "Crate";
      this.setHitbox(34, 34);
      this.setComponentsTop([
        Components.text("Drag me"),
      ]);
    },
  };
}

function Tree(): EventDefinition {
  return {
    name: "Tree",
    onInit() {
      this.name = "Tree";
      this.setHitbox(48, 32);
      this.setComponentsTop([
        Components.text("Tree"),
      ]);
    },
  };
}

const player: RpgPlayerHooks = {
  onConnected(player: RpgPlayer) {
    player.name = "Pointer Tester";
    player.setHitbox(28, 34);
    player.initializeDefaultStats();
    player.changeMap("mouse-interactions-map", { x: 80, y: 360 });
  },

  onJoinMap(player: RpgPlayer) {
    player.setComponentsTop([
      Components.text("{name}"),
      Components.text("Mouse demo"),
    ]);
  },

  async onInput(player: RpgPlayer, input) {
    const action = input?.action ?? input?.input ?? input;
    const data = input?.data ?? {};
    const map = player.getCurrentMap();

    if (!map) return;

    if (action === "mouse:talk") {
      const event = typeof data.eventId === "string"
        ? map.getEvent(data.eventId)
        : undefined;

      if (!event) return;

      const distance = distanceBetween(entityCenter(player), entityCenter(event));
      if (distance > TALK_DISTANCE) {
        await player.showText("Move closer before talking.");
        return;
      }

      await player.showText("Guard: Hover and selection are local. This dialog came from the server.");
      return;
    }

    if (action === "mouse:move-crate") {
      const event = map.getEvent(CRATE_ID);
      const tile = data.tile ?? data.position;

      if (!event || !isPoint(tile)) return;

      const x = clamp(tile.worldX ?? tile.x * TILE_SIZE, 48, MAP_WIDTH - 80);
      const y = clamp(tile.worldY ?? tile.y * TILE_SIZE, 72, MAP_HEIGHT - 72);

      await event.teleport({ x, y });
      return;
    }

    if (action === "mouse:move-player") {
      const position = data.position;
      if (!isPoint(position)) return;

      player.moveTo({
        x: clamp(position.x, 48, MAP_WIDTH - 80),
        y: clamp(position.y, 72, MAP_HEIGHT - 72),
      });
    }
  },
};

export default defineModule<RpgServer>({
  player,
  maps: [
    {
      id: "mouse-interactions-map",
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      hitboxes: [
        { id: "top-wall", x: 24, y: 24, width: MAP_WIDTH - 48, height: 2 },
        { id: "bottom-wall", x: 24, y: MAP_HEIGHT - 24, width: MAP_WIDTH - 48, height: 2 },
        { id: "left-wall", x: 24, y: 24, width: 2, height: MAP_HEIGHT - 48 },
        { id: "right-wall", x: MAP_WIDTH - 24, y: 24, width: 2, height: MAP_HEIGHT - 48 },
      ],
      events: [
        { id: "guard", x: 160, y: 160, event: Guard() },
        { id: "chest", x: 320, y: 165, event: Chest() },
        { id: CRATE_ID, x: 470, y: 170, event: Crate() },
        { id: "tree", x: 570, y: 185, event: Tree() },
      ],
    },
  ],
});
