import { RpgCommonPlayer } from "@rpgjs/common";
import { trigger, signal } from "canvasengine";

export abstract class RpgClientObject extends RpgCommonPlayer {
  abstract type: string;
  emitParticleTrigger = trigger()
  particleName = signal('')

  flash(color: string, duration: number = 100) {
    const lastTint = this.tint()
    this.tint.set(color);
    setTimeout(() => {
      this.tint.set(lastTint)
    }, duration)
  }
}   