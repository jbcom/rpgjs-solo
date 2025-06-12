import { generateUID, RpgCommonPlayer } from "@rpgjs/common";
import { signal } from "canvasengine";

export class EffectManager {
  current = signal<any[]>([]);

  displayEffect(params: any, player: RpgCommonPlayer) {
    const id = generateUID();
    this.current().push({
      ...params,
      id,
      x: player.x,
      y: player.y,
      onFinish: () => {
        const index = this.current().findIndex((value) => value.id === id);
        this.current().splice(index, 1);
      },
    });
  }
}
