import Canvas from "./components/scenes/canvas.ce";
import { Context, inject } from "@signe/di";
import { signal, bootstrapCanvas } from "canvasengine";
import { AbstractWebsocket, WebSocketToken } from "./services/AbstractSocket";
import { LoadMapService, LoadMapToken } from "./services/loadMap";
import { Hooks, ModulesToken, Direction } from "@rpgjs/common";
import { load } from "@signe/sync";
import { RpgClientMap } from "./Game/Map"
import { RpgGui } from "./Gui/Gui";
import { AnimationManager } from "./Game/AnimationManager";
import { lastValueFrom, Observable } from "rxjs";
import { GlobalConfigToken } from "./module";
import * as PIXI from "pixi.js";
import { PrebuiltComponentAnimations } from "./components/animations";

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
  
  // Client-side prediction properties
  private clientPredictionStates: Map<string, {
    x: number;
    y: number;
    direction: Direction;
    animationName: string;
    timestamp: number;
  }> = new Map();
  private lastServerTimestamp: number = 0;
  // Keep a history of client inputs with resulting positions to support reconciliation and replay
  private inputHistory: Array<{ 
    input: Direction; 
    timestamp: number;
    frame: number;
    resultingX: number;
    resultingY: number;
    resultingDirection: Direction;
  }> = [];
  // Maximum time window for input history (in milliseconds)
  private readonly INPUT_HISTORY_MAX_AGE = 2000; // 2 seconds
  // Monotonic frame counter for inputs
  private inputFrameCounter: number = 0;
  // Last acknowledged frame by server
  private lastAckFrame: number = 0;
  // Last acknowledged server tick
  private lastAckServerTick: number = 0;
  // Frame offset to synchronize with server (maps client frame to server tick)
  private frameOffset: number = 0;
  // Track last server timestamp processed per remote player to drop stale updates
  private lastRemoteServerTs: Map<string, number> = new Map();
  // Ping/Pong for RTT measurement
  private rtt: number = 0; // Round-trip time in ms
  private pingInterval: any = null;
  private readonly PING_INTERVAL_MS = 5000; // Send ping every 5 seconds

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
  }

  async start() {
    this.sceneMap = new RpgClientMap()
    this.selector = document.body.querySelector("#rpg") as HTMLElement;

    const { app, canvasElement } = await bootstrapCanvas(this.selector, Canvas);
    this.renderer = app.renderer as PIXI.Renderer;
    this.tick = canvasElement?.propObservables?.context['tick'].observable


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
        this.cleanupOldPredictionStates();
        this.cleanupInputHistory();
      }

      // No custom interpolation – rely on existing engine interpolation
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
      const filteredData = this.applyClientSidePredictionFilter(data);

      this.hooks.callHooks("client-sceneMap-onChanges", this.sceneMap, { partial: filteredData }).subscribe();
      load(this.sceneMap, filteredData, true);

      if (data.ack) this.applyServerAck(data.ack);
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
      this.startPingPong();
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
    const clientFrame = this.inputFrameCounter;
    
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

  /**
   * Apply client-side prediction filtering and server reconciliation
   * 
   * This method filters incoming synchronization data to prevent visual glitches
   * caused by client-side prediction. It implements two main strategies:
   * 1. Filtering: Don't apply position/direction/animation data except for non-movement animations
   * 2. Server reconciliation: Give server authority when timestamp indicates server state is newer
   * 
   * @param data - Raw synchronization data from server
   * @returns Filtered data to apply to client state
   * 
   * @example
   * ```ts
   * // This method is called automatically in the sync event handler
   * const filteredData = engine.applyClientSidePredictionFilter(serverData);
   * load(this.sceneMap, filteredData, true);
   * ```
   */
  private applyClientSidePredictionFilter(data: any): any {
    if (!data.players) return data;
    
    const filteredData = { ...data };
    const currentPlayerId = this.playerIdSignal();
    
    // Extract server timestamp if available
    const serverTimestamp = data.timestamp || Date.now();
    const serverLastProcessedInputTs: number | undefined = data.lastProcessedInputTs;
    
    filteredData.players = { ...data.players };
 
    for (const [playerId, playerData] of Object.entries(data.players as Record<string, any>)) {
      const isCurrentPlayer = playerId === currentPlayerId;
      
      if (!isCurrentPlayer) {
        // For other players, apply all data normally
        continue;
      }
      
      // For current player, apply client-side prediction filtering
      const currentPlayer = this.sceneMap.getCurrentPlayer();
      if (!currentPlayer) {
        continue;
      }
      
      const filteredPlayerData = { ...playerData };
      // Always ignore server movement for current player here; we'll reconcile via ack separately
      delete filteredPlayerData.x;
      delete filteredPlayerData.y;
      delete filteredPlayerData.direction;
      
      // Update last server timestamp
      if (serverTimestamp > this.lastServerTimestamp) {
        this.lastServerTimestamp = serverTimestamp;
      }
      
      // Animation filtering: apply only non-movement animations unless different
      if (playerData.animationName !== undefined) {
        const isMovementAnimation = playerData.animationName === 'stand' || playerData.animationName === 'walk';
        if (isMovementAnimation) {
          delete filteredPlayerData.animationName;
        }
      }
      
      filteredData.players[playerId] = filteredPlayerData;
      
      // No replay here; reconciliation handled after load() using ack
    }

    return filteredData;
  }

  async processInput({ input }: { input: Direction }) {
    const timestamp = Date.now();
    const frame = ++this.inputFrameCounter;
    this.hooks.callHooks("client-engine-onInput", this, { input, playerId: this.playerId }).subscribe();
    
    // Send movement input with timestamp to server
    this.webSocket.emit('move', { 
      input, 
      timestamp,
      frame
    });
    console.debug(
      `[Client] Sent input frame=${frame} direction=${input} timestamp=${timestamp} frameOffset=${this.frameOffset} rtt=${this.rtt}`
    );
    
    const currentPlayer = this.sceneMap.getCurrentPlayer();
    if (currentPlayer) {   
      // Apply movement prediction locally
      await this.sceneMap.movePlayer(currentPlayer, input);
      
      // Store positions after movement using authoritative physics body (top-left)
      const myId = this.playerIdSignal();
      let afterX = currentPlayer.x();
      let afterY = currentPlayer.y();

      if (myId) {
        const body = this.sceneMap.physic.getBody(myId);
        if (body) {
          const width = body.width ?? currentPlayer.hitbox().w;
          const height = body.height ?? currentPlayer.hitbox().h;
          afterX = body.position.x - width / 2;
          afterY = body.position.y - height / 2;
        }
      }
      const afterDirection = currentPlayer.direction();
      
      // Add to input history with resulting positions
      this.inputHistory.push({ 
        input, 
        timestamp,
        frame,
        resultingX: afterX,
        resultingY: afterY,
        resultingDirection: afterDirection
      });
      
      // Clean up old input history entries
      this.cleanupInputHistory();
      
      // Update client prediction state after movement
      this.clientPredictionStates.set(this.playerId!, {
        x: afterX,
        y: afterY,
        direction: afterDirection,
        animationName: currentPlayer.animationName(),
        timestamp
      });
    }
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
    this.clientPredictionStates.clear();
    this.inputHistory = [];
    this.lastServerTimestamp = 0;
    this.frameOffset = 0; // Reset frame offset when changing maps
    this.inputFrameCounter = 0;
    this.lastAckFrame = 0;
  }

  /**
   * Clean up old prediction states
   * 
   * Removes prediction states older than the specified threshold
   * to prevent memory leaks in long-running sessions.
   * 
   * @param maxAge - Maximum age in milliseconds (default: 5000ms)
   * 
   * @example
   * ```ts
   * // Clean up states older than 5 seconds
   * engine.cleanupOldPredictionStates();
   * ```
   */
  cleanupOldPredictionStates(maxAge: number = 5000) {
    const now = Date.now();
    for (const [playerId, state] of this.clientPredictionStates.entries()) {
      if (now - state.timestamp > maxAge) {
        this.clientPredictionStates.delete(playerId);
      }
    }
  }

  /**
   * Clean up old input history entries
   * 
   * Removes input history entries older than INPUT_HISTORY_MAX_AGE
   * to prevent memory leaks and keep the history manageable.
   * 
   * @example
   * ```ts
   * // Clean up old input history entries
   * this.cleanupInputHistory();
   * ```
   */
  private cleanupInputHistory() {
    const now = Date.now();
    this.inputHistory = this.inputHistory.filter(entry => 
      now - entry.timestamp <= this.INPUT_HISTORY_MAX_AGE
    );
    
    // Also limit the number of entries to prevent memory issues
    if (this.inputHistory.length > 100) {
      this.inputHistory = this.inputHistory.slice(-50); // Keep only the last 50 entries
    }
  }

  /**
   * Apply server acknowledgement to reconcile client prediction
   * 
   * Compares the server's ack frame and server tick with the client's input history.
   * Uses serverTick as the authoritative timestamp for more accurate reconciliation.
   * If positions match, do nothing. If they differ, apply server authority.
   * 
   * ## Design
   * 
   * - Uses serverTick as primary reference for reconciliation
   * - Falls back to frame-based reconciliation if serverTick not available
   * - Implements position tolerance to avoid jitter from rounding errors
   * - Respects collision detection when applying corrections
   * - Tracks last acknowledged server tick to prevent old updates
   * 
   * @param ack - Server acknowledgement with frame, serverTick, and authoritative position
   * 
   * @example
   * ```ts
   * // Called automatically when receiving server ack
   * this.applyServerAck({ 
   *   frame: 123, 
   *   serverTick: 7890,
   *   x: 100, 
   *   y: 200, 
   *   direction: Direction.Up 
   * });
   * ```
   */
  private applyServerAck(ack: { 
    frame: number; 
    serverTick?: number;
    x?: number; 
    y?: number; 
    direction?: Direction 
  }) {

    if (typeof ack.frame !== 'number') return;
    
    // Prefer serverTick for ordering if available
    if (typeof ack.serverTick === 'number') {
      if (ack.serverTick < this.lastAckServerTick) {
        console.debug(
          `[Client] Ignoring ack frame=${ack.frame} serverTick=${ack.serverTick} (< last ${this.lastAckServerTick})`
        );
        return; // Ignore old acks based on server tick
      }
      console.debug(
        `[Client] Received ack frame=${ack.frame} serverTick=${ack.serverTick} x=${ack.x} y=${ack.y} direction=${ack.direction}`
      );
    } else if (ack.frame < this.lastAckFrame) {
      console.debug(
        `[Client] Ignoring ack (no serverTick) frame=${ack.frame} (< last ${this.lastAckFrame})`
      );
      return;
    } else {
      console.debug(
        `[Client] Received ack (no serverTick) frame=${ack.frame} x=${ack.x} y=${ack.y} direction=${ack.direction}`
      );
    }

    const firstPendingFrame = this.inputHistory.length > 0 ? this.inputHistory[0].frame : undefined;

    if (firstPendingFrame !== undefined && ack.frame < firstPendingFrame) {
      console.debug(
        `[Client] Skipping ack frame ${ack.frame}; first pending frame=${firstPendingFrame}`
      );
      this.lastAckServerTick = typeof ack.serverTick === 'number' ? ack.serverTick : this.lastAckServerTick;
      this.lastAckFrame = Math.max(this.lastAckFrame, ack.frame);
      return;
    }

    if (firstPendingFrame === undefined && ack.frame < this.lastAckFrame) {
      console.debug(
        `[Client] Ignoring duplicate ack frame ${ack.frame} with empty history`
      );
      this.lastAckServerTick = typeof ack.serverTick === 'number' ? ack.serverTick : this.lastAckServerTick;
      this.lastAckFrame = Math.max(this.lastAckFrame, ack.frame);
      return;
    }

    if (typeof ack.serverTick === 'number') {
      this.lastAckServerTick = ack.serverTick;
    }
    
    this.lastAckFrame = ack.frame;

    const currentPlayer = this.sceneMap.getCurrentPlayer();
    const myId = this.playerIdSignal();
    if (!currentPlayer || !myId) return;

    // If ack is too far behind current predicted frame, ignore to avoid false corrections
    const framesBehind = this.inputFrameCounter - ack.frame;
    if (framesBehind >= 3) {
      // Still advance lastAckFrame so we don't process this ack again
      this.lastAckFrame = ack.frame;
      return;
    }

    // Accept this ack for processing
    this.lastAckFrame = ack.frame;

    // Calculate frame offset if this is one of the first few acks
    if (this.frameOffset === 0 && this.inputHistory.length > 0) {
      const expectedFrame = this.inputHistory[0].frame;
      this.frameOffset = ack.frame - expectedFrame;
    }

    // Find the input entry with the matching frame in our history
    const matchingEntry = this.inputHistory.find(entry => entry.frame === ack.frame);
    
    let correctionApplied = false;

    if (!matchingEntry) {
      // If the frame is not in history, only apply authority when the ack frame is almost current
      const frameDiff = ack.frame - this.inputFrameCounter; // negative if ack is behind
      console.debug(
        `[Client] Ack frame ${ack.frame} not found in history (diff=${frameDiff}). inputCounter=${this.inputFrameCounter}`
      );
      if (Math.abs(frameDiff) <= 1) {
        if (typeof ack.x === 'number' && typeof ack.y === 'number') {
          // Check if position is valid before applying (respects collisions)
          const hitbox = currentPlayer.hitbox();
          if (this.sceneMap.physic.isPositionValid(ack.x, ack.y, hitbox.w, hitbox.h, myId)) {
            const success = this.sceneMap.physic.updateHitbox(myId, ack.x, ack.y, hitbox.w, hitbox.h);
            if (success) {
              correctionApplied = true;
              console.debug(
                `[Client] Applied correction without history entry: position=(${ack.x}, ${ack.y}) direction=${ack.direction}`
              );
            }
          }
        }
        if (typeof ack.direction !== 'undefined') {
          currentPlayer.changeDirection(ack.direction);
          correctionApplied = true;
          console.debug(`[Client] Updated direction without history entry: ${ack.direction}`);
        }
      } 
    } else {
      // Compare server position with our predicted position for that frame
      const POSITION_TOLERANCE = Math.max(3, (currentPlayer as any).speed?.() ?? 4); // tolerate at least one tile-speed step
      let positionsMatch = true;
      
      if (typeof ack.x === 'number' && typeof ack.y === 'number') {
        const xDiff = Math.abs(ack.x - matchingEntry.resultingX);
        const yDiff = Math.abs(ack.y - matchingEntry.resultingY);
        positionsMatch = xDiff <= POSITION_TOLERANCE && yDiff <= POSITION_TOLERANCE;
        
      }
      
      // Check direction match
      if (typeof ack.direction !== 'undefined') {
        const directionMatch = ack.direction === matchingEntry.resultingDirection;
        if (!directionMatch) {
          positionsMatch = false;
        }
      }
      
      // Apply server authority only if positions/direction differ significantly
      if (!positionsMatch) {
        console.debug(
          `[Client] Prediction mismatch for frame ${ack.frame}. Server: (${ack.x}, ${ack.y}) vs predicted: (${matchingEntry.resultingX}, ${matchingEntry.resultingY})`
        );
        if (typeof ack.x === 'number' && typeof ack.y === 'number') {
          // Check if position is valid before applying (respects collisions)
          const hitbox = currentPlayer.hitbox();
          if (this.sceneMap.physic.isPositionValid(ack.x, ack.y, hitbox.w, hitbox.h, myId)) {
            const success = this.sceneMap.physic.updateHitbox(myId, ack.x, ack.y, hitbox.w, hitbox.h);
            if (success) {
              correctionApplied = true;
              console.debug(
                `[Client] Applied correction for frame ${ack.frame}: position=(${ack.x}, ${ack.y}) direction=${ack.direction}`
              );
            }
          }
        }
        if (typeof ack.direction !== 'undefined') {
          currentPlayer.changeDirection(ack.direction);
          correctionApplied = true;
          console.debug(`[Client] Updated direction for frame ${ack.frame}: ${ack.direction}`);
        }
      }
    }

    // Clean up input history: remove entries up to and including the acked frame
    const pendingToReplay = this.inputHistory.filter(entry => entry.frame > ack.frame).sort((a, b) => a.frame - b.frame);
    this.inputHistory = pendingToReplay;

    // If we applied a correction, replay remaining inputs locally to realign prediction
    if (correctionApplied && pendingToReplay.length > 0) {
      console.debug(
        `[Client] Replaying ${pendingToReplay.length} inputs after correction from frame ${ack.frame}`
      );
      this.replayUnackedInputsFromFrame(ack.frame);
    } else if (!correctionApplied) {
      console.debug(
        `[Client] Ack frame ${ack.frame} confirmed prediction. Remaining history=${this.inputHistory.length}`
      );
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
  private async replayUnackedInputsFromFrame(startFrame: number): Promise<void> {
    const currentPlayer = this.sceneMap.getCurrentPlayer();
    const myId = this.playerIdSignal();
    if (!currentPlayer || !myId) return;

    // Re-simulate in chronological order
    for (const entry of this.inputHistory) {
      if (entry.frame <= startFrame) continue;
      await this.sceneMap.movePlayer(currentPlayer, entry.input);
      // Update stored resulting positions after replay
      entry.resultingX = currentPlayer.x();
      entry.resultingY = currentPlayer.y();
      entry.resultingDirection = currentPlayer.direction();
    }
  }
}
