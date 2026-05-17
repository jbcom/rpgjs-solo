import { Control, Direction, defineModule } from "@rpgjs/common";
import type { EventDefinition, RpgPlayerHooks, RpgServer } from "@rpgjs/server";
import { Components, MAXHP, RpgPlayer } from "@rpgjs/server";

function directionVector(direction: Direction): { x: number; y: number } {
  switch (direction) {
    case Direction.Up:
      return { x: 0, y: -1 };
    case Direction.Down:
      return { x: 0, y: 1 };
    case Direction.Left:
      return { x: -1, y: 0 };
    case Direction.Right:
      return { x: 1, y: 0 };
    default:
      return { x: 1, y: 0 };
  }
}

function projectileOrigin(player: RpgPlayer, direction: Direction): { x: number; y: number } {
  const hitbox = player.hitbox();
  const vector = directionVector(direction);
  const center = {
    x: player.x() + hitbox.w / 2,
    y: player.y() + hitbox.h / 2,
  };
  return {
    x: center.x + vector.x * 34,
    y: center.y + vector.y * 34,
  };
}

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

    const direction = player.getDirection() ?? Direction.Right;
    player.projectiles.emit({
      type: "bolt",
      origin: projectileOrigin(player, direction),
      direction,
      trajectory: {
        type: "linear",
        speed: 260,
        range: 620,
        ttl: 2.4,
      },
      collision: {
        ignoreOwner: true,
      },
      payload: {
        damage: 10,
      },
      params: {
        color: "#ef4444",
        trailColor: "#f97316",
      },
      canHit({ target }) {
        return target?.id === "target";
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
