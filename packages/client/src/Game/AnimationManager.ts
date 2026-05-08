import { generateUID, RpgCommonPlayer } from "@rpgjs/common";
import { signal } from "canvasengine";

export class AnimationManager {
  current = signal<any[]>([]);

  displayEffect(params: any, player: RpgCommonPlayer | { x: number, y: number }): Promise<void> {
    const id = generateUID();
    const effectParams = params ?? {};
    return new Promise<void>((resolve) => {
      let finished = false;
      const finish = (data?: any) => {
        if (finished) return;
        finished = true;
        const index = this.current().findIndex((value) => value.id === id);
        if (index !== -1) {
          this.current().splice(index, 1);
        }
        effectParams.onFinish?.(data);
        resolve();
      };

      this.current().push({
        ...effectParams,
        id,
        x: player.x,
        y: player.y,
        object: player,
        onFinish: finish,
      });
    });
  }
}
