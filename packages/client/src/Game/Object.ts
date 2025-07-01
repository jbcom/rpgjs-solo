import { Hooks, ModulesToken, RpgCommonPlayer } from "@rpgjs/common";
import { sync } from "@signe/sync";
import { trigger, signal } from "canvasengine";
import { Subscription } from "rxjs";
import { inject } from "../core/inject";
import { RpgClientEngine } from "../RpgClientEngine";

export abstract class RpgClientObject extends RpgCommonPlayer {
  abstract type: string;
  emitParticleTrigger = trigger()
  particleName = signal('')
  animationCurrentIndex = signal(0)
  animationIsPlaying = signal(false)
  _param = signal({})

  constructor() {
    super()
    this.hooks.callHooks("client-sprite-onInit", this).subscribe();
  }

  get hooks() {
    return inject<Hooks>(ModulesToken);
  }
  
  private animationSubscription?: Subscription

  flash(color: string, duration: number = 100) {
    return new Promise((resolve) => {
      const lastTint = this.tint()
      this.tint.set(color);
      setTimeout(() => {
        this.tint.set(lastTint)
        resolve(true)
      }, duration)
    })
  }

  /**
   * Reset animation state when animation changes externally
   * 
   * This method should be called when the animation changes due to movement
   * or other external factors to ensure the animation system doesn't get stuck
   * 
   * @example
   * ```ts
   * // Reset when player starts moving
   * player.resetAnimationState();
   * ```
   */
  resetAnimationState() {
    this.animationIsPlaying.set(false);
    this.animationCurrentIndex.set(0);
    if (this.animationSubscription) {
      this.animationSubscription.unsubscribe();
      this.animationSubscription = undefined;
    }
  }

  /**
   * Set a custom animation for a specific number of times
   * 
   * Plays a custom animation for the specified number of repetitions.
   * The animation system prevents overlapping animations and automatically
   * returns to the previous animation when complete.
   * 
   * @param animationName - Name of the animation to play
   * @param nbTimes - Number of times to repeat the animation (default: Infinity for continuous)
   * 
   * @example
   * ```ts
   * // Play attack animation 3 times
   * player.setAnimation('attack', 3);
   * 
   * // Play continuous spell animation
   * player.setAnimation('spell');
   * ```
   */
  setAnimation(animationName: string, nbTimes: number = Infinity) {
    if (this.animationIsPlaying()) return;
    this.animationIsPlaying.set(true);
    const previousAnimationName = this.animationName();
    this.animationCurrentIndex.set(0);
    
    // Clean up any existing subscription
    if (this.animationSubscription) {
      this.animationSubscription.unsubscribe();
    }
    
    this.animationSubscription = this.animationCurrentIndex.observable.subscribe(index => {
      if (index >= nbTimes) {
        this.animationCurrentIndex.set(0);
        this.animationName.set(previousAnimationName);
        this.animationIsPlaying.set(false);
        if (this.animationSubscription) {
          this.animationSubscription.unsubscribe();
          this.animationSubscription = undefined;
        }
      }
    })
    this.animationName.set(animationName);
  }

  showComponentAnimation(id: string, params: any) {
    const engine = inject(RpgClientEngine)
    engine.getComponentAnimation(id).displayEffect(params, this)
  }
}   