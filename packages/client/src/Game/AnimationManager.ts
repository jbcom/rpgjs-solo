import { generateUID, RpgCommonPlayer } from "@rpgjs/common";
import { signal } from "canvasengine";

export class AnimationManager {
  current = signal<any[]>([]);

  displayEffect(params: any, player: RpgCommonPlayer | { x: number, y: number }) {
    const id = generateUID();
    this.current().push({
      ...params,
      id,
      x: player.x,
      y: player.y,
      object: player,
      onFinish: () => {
        const index = this.current().findIndex((value) => value.id === id);
        this.current().splice(index, 1);
      },
    });
  }
}
