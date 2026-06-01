import { defineModule } from "@rpgjs/common";
import {
  Components,
  RpgPlayer,
  type EventDefinition,
  type RpgEvent,
  type RpgPlayerHooks,
  type RpgServer,
  type RpgTouchContext,
} from "@rpgjs/server";

const MAP_WIDTH = 720;
const MAP_HEIGHT = 480;
const DOOR_OPEN_VARIABLE = "temple.door.open";

function Plate(): EventDefinition {
  return {
    name: "Plate",
    onInit() {
      this.name = "Plate";
      this.through = true;
      this.setHitbox(54, 24);
      this.setComponentsCenter([
        Components.shape({
          type: "rounded-rectangle",
          fill: "#f4c542",
          width: 54,
          height: 24,
          opacity: 0.86,
          line: { color: "#7c5f10", width: 2 },
        }),
      ]);
      this.setComponentsTop([
        Components.text("Plate", { fill: "#3a2f07", fontSize: 12 }),
      ]);
    },
    onTouch(other: RpgPlayer | RpgEvent, context: RpgTouchContext) {
      if (other.name !== "Stone") return;

      context.map.setVariable(DOOR_OPEN_VARIABLE, true);
    },
    onTouchEnd(other: RpgPlayer | RpgEvent, context: RpgTouchContext) {
      if (other.name !== "Stone") return;

      context.map.setVariable(DOOR_OPEN_VARIABLE, false);
    },
  };
}

function Stone(): EventDefinition {
  return {
    name: "Stone",
    pushable: true,
    mass: 22,
    onInit() {
      this.name = "Stone";
      this.setHitbox(34, 34);
      this.setComponentsCenter([
        Components.shape({
          type: "rounded-rectangle",
          fill: "#7f8a91",
          width: 34,
          height: 34,
          line: { color: "#465158", width: 2 },
        }),
      ]);
      this.setComponentsTop([
        Components.text("Stone", { fill: "#1f2933", fontSize: 12 }),
      ]);
    },
  };
}

function setDoorState(door: RpgEvent, open: boolean): void {
  door.through = open;
  door.setComponentsCenter([
    Components.shape({
      type: "rounded-rectangle",
      fill: open ? "#35b779" : "#b93b3b",
      width: open ? 20 : 42,
      height: 72,
      opacity: open ? 0.55 : 1,
      line: { color: open ? "#1f7a52" : "#672020", width: 2 },
    }),
  ]);
  door.setComponentsTop([
    Components.text(open ? "Open" : "Closed", { fill: open ? "#064e3b" : "#ffffff", fontSize: 12 }),
  ]);
}

function Door(): EventDefinition {
  return {
    name: "Door",
    onInit() {
      this.name = "Door";
      this.setHitbox(42, 72);
      setDoorState(this, false);
    },
    onChanges() {
      const map = this.getCurrentMap();
      const open = map?.getVariable<boolean>(DOOR_OPEN_VARIABLE) === true;

      setDoorState(this, open);
    },
  };
}

const player: RpgPlayerHooks = {
  onConnected(player: RpgPlayer) {
    player.name = "Plate Tester";
    player.setGraphic("hero");
    player.setHitbox(28, 34);
    player.initializeDefaultStats();
    player.changeMap("pressure-plate-map", { x: 120, y: 250 });
  },

  onJoinMap(player: RpgPlayer) {
    player.setComponentsTop([
      Components.text("{name}"),
      Components.text("Push the stone"),
    ]);
  },
};

export default defineModule<RpgServer>({
  player,
  maps: [
    {
      id: "pressure-plate-map",
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      hitboxes: [
        { id: "top-wall", x: 32, y: 32, width: 656, height: 2 },
        { id: "bottom-wall", x: 32, y: 446, width: 656, height: 2 },
        { id: "left-wall", x: 32, y: 32, width: 2, height: 416 },
        { id: "right-wall", x: 686, y: 32, width: 2, height: 416 },
        { id: "door-frame-top", x: 540, y: 150, width: 54, height: 12 },
        { id: "door-frame-bottom", x: 540, y: 234, width: 54, height: 12 },
      ],
      events: [
        { id: "pressure-plate", x: 344, y: 248, event: Plate() },
        { id: "stone", x: 232, y: 244, event: Stone() },
        { id: "door", x: 548, y: 162, event: Door() },
      ],
    },
  ],
});
