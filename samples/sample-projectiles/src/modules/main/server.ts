import { Control, Direction, defineModule } from "@rpgjs/common";
import type { EventDefinition, RpgPlayerHooks, RpgServer } from "@rpgjs/server";
import { Components, MAXHP, RpgPlayer } from "@rpgjs/server";

function Target(): EventDefinition {
  return {
    onInit() {
      this.name = "Target";
      this.setGraphic("monster");
      this.teleport({ x: 500, y: 210 });
      this.hp = 80;
      this.param[MAXHP] = 80;
      this.setComponentsTop([
        Components.text("Target HP: {hp}"),
      ]);
    },
  };
}

const player: RpgPlayerHooks = {
  onConnected(player: RpgPlayer) {
    player.name = "Shooter";
    player.setGraphic("hero");
    player.initializeDefaultStats();
    player.changeMap("projectiles-map", { x: 110, y: 210 });
  },

  onJoinMap(player: RpgPlayer) {
    player.setComponentsTop([
      Components.text("{name}"),
      Components.text("Action = shoot"),
    ]);
  },

  onInput(player: RpgPlayer, input) {
    const action = input?.action ?? input?.input ?? input;
    if (action !== Control.Action && action !== "action") {
      return;
    }

    player.projectiles.emit({
      type: "bolt",
      direction: player.getDirection() ?? Direction.Right,
      trajectory: {
        type: "linear",
        speed: 520,
        range: 520,
        ttl: 1.2,
      },
      payload: {
        damage: 10,
      },
      params: {
        color: "#ff6b35",
        trailColor: "#ffd166",
      },
    });
  },
};

export default defineModule<RpgServer>({
  player,
  maps: [
    {
      id: "projectiles-map",
      events: [
        {
          id: "target",
          event: Target(),
        },
      ],
    },
  ],
  projectiles: {
    onImpact({ projectile, target }) {
      const damage = Number(projectile.payload?.damage ?? 0);
      if (!target || !Number.isFinite(damage) || damage <= 0) {
        return;
      }
      if (typeof target.hp === "number") {
        target.hp = Math.max(0, target.hp - damage);
      }
    },
  },
});
