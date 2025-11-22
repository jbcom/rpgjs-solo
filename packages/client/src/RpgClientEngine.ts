import Canvas from "./components/scenes/canvas.ce";
import { Context, inject } from "@signe/di";
import { signal, bootstrapCanvas } from "canvasengine";
import { AbstractWebsocket, WebSocketToken } from "./services/AbstractSocket";
import { LoadMapService, LoadMapToken } from "./services/loadMap";
import { Hooks, ModulesToken, Direction } from "@rpgjs/common";

type DirectionValue = "up" | "down" | "left" | "right";
import { load } from "@signe/sync";
import { RpgClientMap } from "./Game/Map"
import { RpgGui } from "./Gui/Gui";
import { AnimationManager } from "./Game/AnimationManager";
import { lastValueFrom, Observable } from "rxjs";
import { GlobalConfigToken } from "./module";
import * as PIXI from "pixi.js";
import { PrebuiltComponentAnimations } from "./components/animations";
import {
  PredictionController,
  type PredictionState,
} from "@rpgjs/common";

export class RpgClientEngine<T = any> {
  private guiService: RpgGui;
  private webSocket: AbstractWebsocket;
  private loadMapService: LoadMapService;
  private hooks: Hooks;
  private sceneMap: RpgClientMap
  private selector: HTMLElement;
  public globalConfig: T;
  public sceneComponent: any;
  stopProcessingInput = false;
  width = signal("100%");
  height = signal("100%");
  spritesheets: Map<string, any> = new Map();
  sounds: Map<string, any> = new Map();
  componentAnimations: any[] = [];
  private spritesheetResolver?: (id: string) => any | Promise<any>;
  particleSettings: {
    emitters: any[]
  } = {
      emitters: []
    }
  renderer: PIXI.Renderer;
  tick: Observable<number>;
  playerIdSignal = signal<string | null>(null);
  spriteComponentsBehind = signal<any[]>([]);
  spriteComponentsInFront = signal<any[]>([]);

  private predictionEnabled = false;
  private prediction?: PredictionController<Direction>;
  private readonly SERVER_CORRECTION_THRESHOLD = 30;
  private inputFrameCounter = 0;
  private frameOffset = 0;
  // Ping/Pong for RTT measurement
  private rtt: number = 0; // Round-trip time in ms
  private pingInterval: any = null;
  private readonly PING_INTERVAL_MS = 5000; // Send ping every 5 seconds
  private lastInputTime = 0;

  constructor(public context: Context) {
    this.webSocket = inject(context, WebSocketToken);
    this.guiService = inject(context, RpgGui);
    this.loadMapService = inject(context, LoadMapToken);
    this.hooks = inject<Hooks>(context, ModulesToken);
    this.globalConfig = inject(context, GlobalConfigToken)

    if (!this.globalConfig) {
      this.globalConfig = {} as T
    }
    if (!(this.globalConfig as any).box) {
      (this.globalConfig as any).box = {
        styles: {
          backgroundColor: "#1a1a2e",
          backgroundOpacity: 0.9
        },
        sounds: {}
      }
    }

    this.addComponentAnimation({
      id: "animation",
      component: PrebuiltComponentAnimations.Animation
    })

    this.predictionEnabled = (this.globalConfig as any)?.prediction?.enabled !== false;
    this.initializePredictionController();
  }

  async start() {
    this.sceneMap = new RpgClientMap()
    this.selector = document.body.querySelector("#rpg") as HTMLElement;

    const { app, canvasElement } = await bootstrapCanvas(this.selector, Canvas);
    this.renderer = app.renderer as PIXI.Renderer;
    this.tick = canvasElement?.propObservables?.context['tick'].observable

    this.tick.subscribe(() => {
      if (Date.now() - this.lastInputTime > 100) {
        const player = this.getCurrentPlayer();
        if (!player) return;
        (this.sceneMap as any).stopMovement(player);
      }
    })


    this.hooks.callHooks("client-spritesheets-load", this).subscribe();
    this.hooks.callHooks("client-spritesheetResolver-load", this).subscribe();
    this.hooks.callHooks("client-sounds-load", this).subscribe();
    this.hooks.callHooks("client-gui-load", this).subscribe();
    this.hooks.callHooks("client-particles-load", this).subscribe();
    this.hooks.callHooks("client-componentAnimations-load", this).subscribe();
    this.hooks.callHooks("client-sprite-load", this).subscribe();

    await lastValueFrom(this.hooks.callHooks("client-engine-onStart", this));

    // wondow is resize
    window.addEventListener('resize', () => {
      this.hooks.callHooks("client-engine-onWindowResize", this).subscribe();
    })

    this.tick.subscribe((tick) => {
      this.hooks.callHooks("client-engine-onStep", this, tick).subscribe();

      // Clean up old prediction states and input history every 60 ticks (approximately every second at 60fps)
      if (tick % 60 === 0) {
        const now = Date.now();
        this.prediction?.cleanup(now);
        this.prediction?.tryApplyPendingSnapshot();
      }
    })

    await this.webSocket.connection(() => {
      this.initListeners()
      this.guiService._initialize()
    });
  }

  private initListeners() {
    this.webSocket.on("sync", (data) => {

      if (data.pId) this.playerIdSignal.set(data.pId)
      // Apply client-side prediction filtering and server reconciliation

      this.hooks.callHooks("client-sceneMap-onChanges", this.sceneMap, { partial: data }).subscribe();

      load(this.sceneMap, data, true);
    });

    // Handle pong responses for RTT measurement
    this.webSocket.on("pong", (data: { serverTick: number; clientFrame: number; clientTime: number }) => {
      const now = Date.now();
      this.rtt = now - data.clientTime;

      // Calculate frame offset: how many ticks ahead the server is compared to our frame counter
      // This helps us estimate which server tick corresponds to each client input frame
      const estimatedTicksInFlight = Math.floor(this.rtt / 2 / (1000 / 60)); // Estimate ticks during half RTT
      const estimatedServerTickNow = data.serverTick + estimatedTicksInFlight;

      // Update frame offset (only if we have inputs to calibrate with)
      if (this.inputFrameCounter > 0) {
        this.frameOffset = estimatedServerTickNow - data.clientFrame;
      }

      console.debug(`[Ping/Pong] RTT: ${this.rtt}ms, ServerTick: ${data.serverTick}, FrameOffset: ${this.frameOffset}`);
    });

    this.webSocket.on("changeMap", (data) => {
      this.sceneMap.reset()
      this.loadScene(data.mapId);
    });

    this.webSocket.on("showComponentAnimation", (data) => {
      const { params, object, position, id } = data;
      if (!object && position === undefined) {
        throw new Error("Please provide an object or x and y coordinates");
      }
      const player = object ? this.sceneMap.getObjectById(object) : undefined;
      this.getComponentAnimation(id).displayEffect(params, player || position)
    });

    this.webSocket.on("setAnimation", (data) => {
      const { animationName, nbTimes, object } = data;
      const player = this.sceneMap.getObjectById(object);
      player.setAnimation(animationName, nbTimes)
    })

    this.webSocket.on('open', () => {
      this.hooks.callHooks("client-engine-onConnected", this, this.socket).subscribe();
      // Start ping/pong for synchronization
    })

    this.webSocket.on('close', () => {
      this.hooks.callHooks("client-engine-onDisconnected", this, this.socket).subscribe();
      // Stop ping/pong when disconnected
      this.stopPingPong();
    })

    this.webSocket.on('error', (error) => {
      this.hooks.callHooks("client-engine-onConnectError", this, error, this.socket).subscribe();
    })
  }

  /**
   * Start periodic ping/pong for client-server synchronization
   * 
   * Sends ping requests to the server to measure round-trip time (RTT) and
   * calculate the frame offset between client and server ticks.
   * 
   * ## Design
   * 
   * - Sends ping every 5 seconds
   * - Measures RTT for latency compensation
   * - Calculates frame offset to map client frames to server ticks
   * - Used for accurate server reconciliation
   * 
   * @example
   * ```ts
   * // Called automatically when connection opens
   * this.startPingPong();
   * ```
   */
  private startPingPong(): void {
    // Stop existing interval if any
    this.stopPingPong();

    // Send initial ping immediately
    this.sendPing();

    // Set up periodic pings
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, this.PING_INTERVAL_MS);
  }

  /**
   * Stop periodic ping/pong
   * 
   * Stops the ping interval when disconnecting or changing maps.
   * 
   * @example
   * ```ts
   * // Called automatically when connection closes
   * this.stopPingPong();
   * ```
   */
  private stopPingPong(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Send a ping request to the server
   * 
   * Sends current client time and frame counter to the server,
   * which will respond with its server tick for synchronization.
   * 
   * @example
   * ```ts
   * // Send a ping to measure RTT
   * this.sendPing();
   * ```
   */
  private sendPing(): void {
    const clientTime = Date.now();
    const clientFrame = this.getPhysicsTick();

    this.webSocket.emit('ping', {
      clientTime,
      clientFrame
    });
  }

  private async loadScene(mapId: string) {
    this.hooks.callHooks("client-sceneMap-onBeforeLoading", this.sceneMap).subscribe();

    // Clear client prediction states when changing maps
    this.clearClientPredictionStates();

    this.webSocket.updateProperties({ room: mapId })
    await this.webSocket.reconnect(() => {
      this.initListeners()
      this.guiService._initialize()
    })
    const res = await this.loadMapService.load(mapId)
    this.sceneMap.data.set(res)
    this.hooks.callHooks("client-sceneMap-onAfterLoading", this.sceneMap).subscribe();
    this.sceneMap.loadPhysic()
  }

  addSpriteSheet<T = any>(spritesheetClass: any, id?: string): any {
    this.spritesheets.set(id || spritesheetClass.id, spritesheetClass);
    return spritesheetClass as any;
  }

  /**
   * Set a resolver function for spritesheets
   * 
   * The resolver is called when a spritesheet is requested but not found in the cache.
   * It can be synchronous (returns directly) or asynchronous (returns a Promise).
   * The resolved spritesheet is automatically cached for future use.
   * 
   * @param resolver - Function that takes a spritesheet ID and returns a spritesheet or Promise of spritesheet
   * 
   * @example
   * ```ts
   * // Synchronous resolver
   * engine.setSpritesheetResolver((id) => {
   *   if (id === 'dynamic-sprite') {
   *     return { id: 'dynamic-sprite', image: 'path/to/image.png', framesWidth: 32, framesHeight: 32 };
   *   }
   *   return undefined;
   * });
   * 
   * // Asynchronous resolver (loading from API)
   * engine.setSpritesheetResolver(async (id) => {
   *   const response = await fetch(`/api/spritesheets/${id}`);
   *   const data = await response.json();
   *   return data;
   * });
   * ```
   */
  setSpritesheetResolver(resolver: (id: string) => any | Promise<any>): void {
    this.spritesheetResolver = resolver;
  }

  /**
   * Get a spritesheet by ID, using resolver if not found in cache
   * 
   * This method first checks if the spritesheet exists in the cache.
   * If not found and a resolver is set, it calls the resolver to create the spritesheet.
   * The resolved spritesheet is automatically cached for future use.
   * 
   * @param id - The spritesheet ID to retrieve
   * @returns The spritesheet if found or created, or undefined if not found and no resolver
   * @returns Promise<any> if the resolver is asynchronous
   * 
   * @example
   * ```ts
   * // Synchronous usage
   * const spritesheet = engine.getSpriteSheet('my-sprite');
   * 
   * // Asynchronous usage (when resolver returns Promise)
   * const spritesheet = await engine.getSpriteSheet('dynamic-sprite');
   * ```
   */
  getSpriteSheet(id: string): any | Promise<any> {
    // Check cache first
    if (this.spritesheets.has(id)) {
      return this.spritesheets.get(id);
    }

    // If not in cache and resolver exists, use it
    if (this.spritesheetResolver) {
      const result = this.spritesheetResolver(id);

      // Check if result is a Promise
      if (result instanceof Promise) {
        return result.then((spritesheet) => {
          if (spritesheet) {
            // Cache the resolved spritesheet
            this.spritesheets.set(id, spritesheet);
          }
          return spritesheet;
        });
      } else {
        // Synchronous result
        if (result) {
          // Cache the resolved spritesheet
          this.spritesheets.set(id, result);
        }
        return result;
      }
    }

    // No resolver and not in cache
    return undefined;
  }

  addSound(sound: any, id?: string) {
    this.sounds.set(id || sound.id, sound);
    return sound;
  }

  addParticle(particle: any) {
    this.particleSettings.emitters.push(particle)
    return particle;
  }

  /**
   * Add a component to render behind sprites
   * Components added with this method will be displayed with a lower z-index than the sprite
   * 
   * @param component - The component to add behind sprites
   * @returns The added component
   * 
   * @example
   * ```ts
   * // Add a shadow component behind all sprites
   * engine.addSpriteComponentBehind(ShadowComponent);
   * ```
   */
  addSpriteComponentBehind(component: any) {
    this.spriteComponentsBehind.update((components: any[]) => [...components, component])
    return component
  }

  /**
   * Add a component to render in front of sprites
   * Components added with this method will be displayed with a higher z-index than the sprite
   * 
   * @param component - The component to add in front of sprites
   * @returns The added component
   * 
   * @example
   * ```ts
   * // Add a health bar component in front of all sprites
   * engine.addSpriteComponentInFront(HealthBarComponent);
   * ```
   */
  addSpriteComponentInFront(component: any) {
    this.spriteComponentsInFront.update((components: any[]) => [...components, component])
    return component
  }

  /**
   * Add a component animation to the engine
   * 
   * Component animations are temporary visual effects that can be displayed
   * on sprites or objects, such as hit indicators, spell effects, or status animations.
   * 
   * @param componentAnimation - The component animation configuration
   * @param componentAnimation.id - Unique identifier for the animation
   * @param componentAnimation.component - The component function to render
   * @returns The added component animation configuration
   * 
   * @example
   * ```ts
   * // Add a hit animation component
   * engine.addComponentAnimation({
   *   id: 'hit',
   *   component: HitComponent
   * });
   * 
   * // Add an explosion effect component
   * engine.addComponentAnimation({
   *   id: 'explosion',
   *   component: ExplosionComponent
   * });
   * ```
   */
  addComponentAnimation(componentAnimation: {
    component: any,
    id: string
  }) {
    const instance = new AnimationManager()
    this.componentAnimations.push({
      id: componentAnimation.id,
      component: componentAnimation.component,
      instance: instance,
      current: instance.current
    })
    return componentAnimation;
  }

  /**
   * Get a component animation by its ID
   * 
   * Retrieves the EffectManager instance for a specific component animation,
   * which can be used to display the animation on sprites or objects.
   * 
   * @param id - The unique identifier of the component animation
   * @returns The EffectManager instance for the animation
   * @throws Error if the component animation is not found
   * 
   * @example
   * ```ts
   * // Get the hit animation and display it
   * const hitAnimation = engine.getComponentAnimation('hit');
   * hitAnimation.displayEffect({ text: "Critical!" }, player);
   * ```
   */
  getComponentAnimation(id: string): AnimationManager {
    const componentAnimation = this.componentAnimations.find((componentAnimation) => componentAnimation.id === id)
    if (!componentAnimation) {
      throw new Error(`Component animation with id ${id} not found`)
    }
    return componentAnimation.instance
  }

  async processInput({ input }: { input: Direction }) {
    const timestamp = Date.now();
    let frame: number;
    let tick: number;
    if (this.predictionEnabled && this.prediction) {
      const meta = this.prediction.recordInput(input, timestamp);
      frame = meta.frame;
      tick = meta.tick;
    } else {
      frame = ++this.inputFrameCounter;
      tick = this.getPhysicsTick();
    }
    this.hooks.callHooks("client-engine-onInput", this, { input, playerId: this.playerId }).subscribe();

    this.webSocket.emit('move', {
      input,
      timestamp,
      frame,
      tick,
    });

    const currentPlayer = this.sceneMap.getCurrentPlayer();
    if (currentPlayer) {
      (this.sceneMap as any).moveBody(currentPlayer, input);
    }
    this.lastInputTime = Date.now();
    const myId = this.playerIdSignal();

  }

  processAction({ action }: { action: number }) {
    if (this.stopProcessingInput) return;
    this.hooks.callHooks("client-engine-onInput", this, { input: 'action', playerId: this.playerId }).subscribe();
    this.webSocket.emit('action', { action })
  }

  get PIXI() {
    return PIXI
  }

  get socket() {
    return this.webSocket
  }

  get playerId() {
    return this.playerIdSignal()
  }

  get scene() {
    return this.sceneMap
  }

  private getPhysicsTick(): number {
    return this.sceneMap?.getTick?.() ?? 0;
  }

  private getLocalPlayerState(): PredictionState<Direction> {
    const currentPlayer = this.sceneMap?.getCurrentPlayer();
    if (!currentPlayer) {
      return { x: 0, y: 0, direction: Direction.Down };
    }
    const topLeft = this.sceneMap.getBodyPosition(currentPlayer.id, "top-left");
    const x = topLeft?.x ?? currentPlayer.x();
    const y = topLeft?.y ?? currentPlayer.y();
    const direction = currentPlayer.direction();
    return { x, y, direction };
  }

  private applyAuthoritativeState(state: PredictionState<Direction>): void {
    const player = this.sceneMap?.getCurrentPlayer();
    if (!player) return;
    const hitbox = typeof player.hitbox === "function" ? player.hitbox() : player.hitbox;
    const width = hitbox?.w ?? 0;
    const height = hitbox?.h ?? 0;
    const updated = this.sceneMap.updateHitbox(player.id, state.x, state.y, width, height);
    if (!updated) {
      this.sceneMap.setBodyPosition(player.id, state.x, state.y, "top-left");
    }
    player.x.set(Math.round(state.x));
    player.y.set(Math.round(state.y));
    if (state.direction) {
      player.changeDirection(state.direction);
    }
  }

  private initializePredictionController(): void {
    if (!this.predictionEnabled) {
      this.prediction = undefined;
      return;
    }
    this.prediction = new PredictionController<Direction>({
      correctionThreshold: (this.globalConfig as any)?.prediction?.correctionThreshold ?? this.SERVER_CORRECTION_THRESHOLD,
      historyTtlMs: (this.globalConfig as any)?.prediction?.historyTtlMs ?? 2000,
      getPhysicsTick: () => this.getPhysicsTick(),
      getCurrentState: () => this.getLocalPlayerState(),
      setAuthoritativeState: (state) => this.applyAuthoritativeState(state),
    });
  }

  getCurrentPlayer() {
    return this.sceneMap.getCurrentPlayer()
  }

  /**
   * Clear client prediction states for cleanup
   * 
   * Removes old prediction states and input history to prevent memory leaks.
   * Should be called when changing maps or disconnecting.
   * 
   * @example
   * ```ts
   * // Clear prediction states when changing maps
   * engine.clearClientPredictionStates();
   * ```
   */
  clearClientPredictionStates() {
    this.initializePredictionController();
    this.frameOffset = 0;
    this.inputFrameCounter = 0;
  }

  private applyServerAck(ack: { frame: number; serverTick?: number; x?: number; y?: number; direction?: Direction }) {
    if (this.predictionEnabled && this.prediction) {
      this.prediction.applyServerAck({
        frame: ack.frame,
        serverTick: ack.serverTick,
        state:
          typeof ack.x === "number" && typeof ack.y === "number"
            ? { x: ack.x, y: ack.y, direction: ack.direction }
            : undefined,
      });
      return;
    }

    if (typeof ack.x !== "number" || typeof ack.y !== "number") {
      return;
    }
    const player = this.getCurrentPlayer();
    const myId = this.playerIdSignal();
    if (!player || !myId) {
      return;
    }
    const hitbox = typeof player.hitbox === "function" ? player.hitbox() : player.hitbox;
    const width = hitbox?.w ?? 0;
    const height = hitbox?.h ?? 0;
    const updated = this.sceneMap.updateHitbox(myId, ack.x, ack.y, width, height);
    if (!updated) {
      this.sceneMap.setBodyPosition(myId, ack.x, ack.y, "top-left");
    }
    player.x.set(Math.round(ack.x));
    player.y.set(Math.round(ack.y));
    if (ack.direction) {
      player.changeDirection(ack.direction);
    }
  }

  /**
   * Replay unacknowledged inputs from a given frame to resimulate client prediction
   * after applying server authority at a certain frame.
   * 
   * @param startFrame - The last server-acknowledged frame
   * 
   * @example
   * ```ts
   * // After applying a server correction at frame N
   * this.replayUnackedInputsFromFrame(N);
   * ```
   */
  private async replayUnackedInputsFromFrame(_startFrame: number): Promise<void> {
    // Prediction controller handles replay internally. Kept for backwards compatibility.
  }
}
