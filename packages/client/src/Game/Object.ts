import { Hooks, ModulesToken, RpgCommonPlayer } from "@rpgjs/common";
import { trigger, signal, effect } from "canvasengine";
import { filter, from, map, of, Subscription, switchMap } from "rxjs";
import { inject } from "../core/inject";
import { RpgClientEngine } from "../RpgClientEngine";
import TextComponent from "../components/dynamics/text.ce";

const DYNAMIC_COMPONENTS = {
  text: TextComponent,
}

type Frame = { x: number; y: number; ts: number };

type AnimationRestoreOptions = {
  restoreAnimationName?: string;
  restoreGraphics?: any[];
};

export abstract class RpgClientObject extends RpgCommonPlayer {
  abstract _type: string;
  emitParticleTrigger = trigger();
  particleName = signal("");
  animationCurrentIndex = signal(0);
  animationIsPlaying = signal(false);
  _param = signal({});
  frames: Frame[] = [];
  graphicsSignals = signal<any[]>([]);
  _component = {} // temporary component memory
  flashTrigger = trigger();
  private animationRestoreState?: {
    animationName: string;
    graphics: any[];
  };

  constructor() {
    super();
    this.hooks.callHooks("client-sprite-onInit", this).subscribe();

    this._frames.observable.subscribe(({ items }) => {
      if (!this.id) return;
      //if (this.id == this.engine.playerIdSignal()!) return;
      const nextFrames = items.flatMap((item): Frame[] =>
        Array.isArray(item) ? item : [item]
      );
      this.frames = [...this.frames, ...nextFrames];
    });

    this.graphics.observable
    .pipe(
      map(({ items }) => items),
      switchMap(graphics => {
        if (graphics.length === 0) return of([]);
        return from(Promise.all(graphics.map(graphic => this.engine.getSpriteSheet(graphic))));
      })
    )
    .subscribe((sheets) => {  
      this.graphicsSignals.set(sheets);
    });

    this.componentsTop.observable
    .pipe(
      filter(value => value !== null && value !== undefined),
      map((value) => typeof value === 'string' ? JSON.parse(value) : value),
    )
    .subscribe(({components}) => {
      for (const component of components) {
        for (const [key, value] of Object.entries(component)) {
          this._component = value as any; // temporary component memory
          console.log(value)
          const type = (value as any).type as keyof typeof DYNAMIC_COMPONENTS;
          if (DYNAMIC_COMPONENTS[type]) {
            this.engine.addSpriteComponentInFront(DYNAMIC_COMPONENTS[type]);
          }
        }
      }
    });

    this.engine.tick
      .pipe
      //throttleTime(10)
      ()
      .subscribe(() => {
        const frame = this.frames.shift();
        if (frame) {
          if (typeof frame.x !== "number" || typeof frame.y !== "number") return;
          this.engine.scene.setBodyPosition(
            this.id,
            frame.x,
            frame.y,
            "top-left"
          );
        }
      });
  }

  /**
   * Access the shared client hook registry.
   *
   * @returns The hook service used to register and trigger client-side hooks.
   */
  get hooks() {
    return inject<Hooks>(ModulesToken);
  }

  /**
   * Access the current client engine instance.
   *
   * @returns The active {@link RpgClientEngine} instance.
   */
  get engine() {
    return inject(RpgClientEngine);
  }

  private animationSubscription?: Subscription;
  private animationResetTimeout?: ReturnType<typeof setTimeout>;

  private clearAnimationControls() {
    if (this.animationSubscription) {
      this.animationSubscription.unsubscribe();
      this.animationSubscription = undefined;
    }
    if (this.animationResetTimeout) {
      clearTimeout(this.animationResetTimeout);
      this.animationResetTimeout = undefined;
    }
  }

  private finishTemporaryAnimation() {
    const restoreState = this.animationRestoreState;
    this.clearAnimationControls();
    this.animationCurrentIndex.set(0);
    if (restoreState) {
      this.animationName.set(restoreState.animationName);
      this.graphics.set([...restoreState.graphics]);
    }
    this.animationRestoreState = undefined;
    this.animationIsPlaying.set(false);
  }

  /**
   * Trigger a flash animation on this sprite
   * 
   * This method triggers a flash effect using CanvasEngine's flash directive.
   * The flash can be configured with various options including type (alpha, tint, or both),
   * duration, cycles, and color.
   * 
   * ## Design
   * 
   * The flash uses a trigger system that is connected to the flash directive in the
   * character component. This allows for flexible configuration and can be triggered
   * from both server events and client-side code.
   * 
   * @param options - Flash configuration options
   * @param options.type - Type of flash effect: 'alpha' (opacity), 'tint' (color), or 'both' (default: 'alpha')
   * @param options.duration - Duration of the flash animation in milliseconds (default: 300)
   * @param options.cycles - Number of flash cycles (flash on/off) (default: 1)
   * @param options.alpha - Alpha value when flashing, from 0 to 1 (default: 0.3)
   * @param options.tint - Tint color when flashing as hex value or color name (default: 0xffffff - white)
   * 
   * @example
   * ```ts
   * // Simple flash with default settings (alpha flash)
   * player.flash();
   * 
   * // Flash with red tint
   * player.flash({ type: 'tint', tint: 0xff0000 });
   * 
   * // Flash with both alpha and tint
   * player.flash({ 
   *   type: 'both', 
   *   alpha: 0.5, 
   *   tint: 0xff0000,
   *   duration: 200,
   *   cycles: 2
   * });
   * 
   * // Quick damage flash
   * player.flash({ 
   *   type: 'tint', 
   *   tint: 0xff0000, 
   *   duration: 150,
   *   cycles: 1
   * });
   * ```
   */
  flash(options?: {
    type?: 'alpha' | 'tint' | 'both';
    duration?: number;
    cycles?: number;
    alpha?: number;
    tint?: number | string;
  }): void {
    const flashOptions = {
      type: options?.type || 'alpha',
      duration: options?.duration ?? 300,
      cycles: options?.cycles ?? 1,
      alpha: options?.alpha ?? 0.3,
      tint: options?.tint ?? 0xffffff,
    };
    
    // Convert color name to hex if needed
    let tintValue = flashOptions.tint;
    if (typeof tintValue === 'string') {
      // Common color name to hex mapping
      const colorMap: Record<string, number> = {
        'white': 0xffffff,
        'red': 0xff0000,
        'green': 0x00ff00,
        'blue': 0x0000ff,
        'yellow': 0xffff00,
        'cyan': 0x00ffff,
        'magenta': 0xff00ff,
        'black': 0x000000,
      };
      tintValue = colorMap[tintValue.toLowerCase()] ?? 0xffffff;
    }
    
    this.flashTrigger.start({
      ...flashOptions,
      tint: tintValue,
    });
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
    if (this.animationRestoreState) {
      this.finishTemporaryAnimation();
      return;
    }
    this.animationIsPlaying.set(false);
    this.animationCurrentIndex.set(0);
    this.clearAnimationControls();
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
  setAnimation(animationName: string, nbTimes?: number, options?: AnimationRestoreOptions): void;
  /**
   * Set a custom animation with temporary graphic change
   *
   * Plays a custom animation for the specified number of repetitions and temporarily
   * changes the player's graphic (sprite sheet) during the animation. The graphic
   * is automatically reset when the animation finishes.
   *
   * @param animationName - Name of the animation to play
   * @param graphic - The graphic(s) to temporarily use during the animation
   * @param nbTimes - Number of times to repeat the animation (default: Infinity for continuous)
   *
   * @example
   * ```ts
   * // Play attack animation with temporary graphic change
   * player.setAnimation('attack', 'hero_attack', 3);
   * ```
   */
  setAnimation(animationName: string, graphic?: string | string[], nbTimes?: number, options?: AnimationRestoreOptions): void;
  setAnimation(
    animationName: string,
    graphicOrNbTimes?: string | string[] | number,
    nbTimesOrOptions?: number | AnimationRestoreOptions,
    options?: AnimationRestoreOptions
  ): void {
    let graphic: string | string[] | undefined;
    let finalNbTimes: number = Infinity;
    let restoreOptions: AnimationRestoreOptions | undefined = options;

    // Handle overloads
    if (typeof graphicOrNbTimes === 'number') {
      // setAnimation(animationName, nbTimes)
      finalNbTimes = graphicOrNbTimes;
      restoreOptions = typeof nbTimesOrOptions === 'object' ? nbTimesOrOptions : options;
    } else if (graphicOrNbTimes !== undefined) {
      // setAnimation(animationName, graphic, nbTimes)
      graphic = graphicOrNbTimes;
      if (typeof nbTimesOrOptions === 'number') {
        finalNbTimes = nbTimesOrOptions;
      } else {
        finalNbTimes = Infinity;
        restoreOptions = nbTimesOrOptions ?? options;
      }
    } else {
      // setAnimation(animationName) - nbTimes remains Infinity
      finalNbTimes = Infinity;
    }

    if (this.animationIsPlaying()) {
      this.finishTemporaryAnimation();
    }

    this.animationIsPlaying.set(true);
    const previousAnimationName =
      restoreOptions?.restoreAnimationName ?? this.animationName();
    const previousGraphics = restoreOptions?.restoreGraphics
      ? [...restoreOptions.restoreGraphics]
      : [...this.graphics()];
    this.animationRestoreState = {
      animationName: previousAnimationName,
      graphics: previousGraphics,
    };
    this.animationCurrentIndex.set(0);

    // Temporarily change graphic if provided
    if (graphic !== undefined) {
      if (Array.isArray(graphic)) {
        this.graphics.set(graphic);
      } else {
        this.graphics.set([graphic]);
      }
    }

    this.clearAnimationControls();

    this.animationSubscription =
      this.animationCurrentIndex.observable.subscribe((index) => {
        if (index >= finalNbTimes) {
          this.finishTemporaryAnimation();
        }
      });

    if (finalNbTimes !== Infinity) {
      this.animationResetTimeout = setTimeout(() => {
        if (this.animationIsPlaying()) {
          this.finishTemporaryAnimation();
        }
      }, Math.max(1000, finalNbTimes * 1000));
    }

    this.animationName.set(animationName);
  }

  /**
   * Display a registered component animation effect on this object.
   *
   * @param id - Identifier of the component animation to play.
   * @param params - Parameters forwarded to the animation effect.
   */
  showComponentAnimation(id: string, params: any) {
    const engine = inject(RpgClientEngine);
    engine.getComponentAnimation(id).displayEffect(params, this);
  }
  
  /**
   * Check whether this client object represents an event.
   *
   * @returns `true` if the object type is `event`, otherwise `false`.
   */
  isEvent(): boolean {
    return this._type === 'event';
  }

  /**
   * Check whether this client object represents a player.
   *
   * @returns `true` if the object type is `player`, otherwise `false`.
   */
  isPlayer(): boolean {
    return this._type === 'player';
  }
}
