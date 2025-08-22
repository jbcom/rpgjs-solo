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
  // Frame offset to synchronize with server
  private frameOffset: number = 0;
  // Track last server timestamp processed per remote player to drop stale updates
  private lastRemoteServerTs: Map<string, number> = new Map();

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
      const serverTimestamp = data.timestamp || Date.now();
      
      // Remove x,y from filteredData before loading to sceneMap
      const dataWithoutPositions = this.removePositionsFromData(filteredData);
      
      this.hooks.callHooks("client-sceneMap-onChanges", this.sceneMap, { partial: dataWithoutPositions }).subscribe();
      load(this.sceneMap, dataWithoutPositions, true);

      // Update physics after sceneMap has been updated
      this.updatePhysicsFromSync(filteredData);

      if (data.ack) this.applyServerAck(data.ack);
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
    })

    this.webSocket.on('close', () => {
      this.hooks.callHooks("client-engine-onDisconnected", this, this.socket).subscribe();
    })

    this.webSocket.on('error', (error) => {
      this.hooks.callHooks("client-engine-onConnectError", this, error, this.socket).subscribe();
    })
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
          const width = body.bounds.max.x - body.bounds.min.x;
          const height = body.bounds.max.y - body.bounds.min.y;
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
   * Compares the server's ack frame with the client's input history.
   * If the positions match, do nothing. If they differ, apply server authority.
   * 
   * @param ack - Server acknowledgement with frame and authoritative position
   * 
   * @example
   * ```ts
   * // Called automatically when receiving server ack
   * this.applyServerAck({ frame: 123, x: 100, y: 200, direction: Direction.Up });
   * ```
   */
  private applyServerAck(ack: { frame: number; x?: number; y?: number; direction?: Direction }) {
    if (typeof ack.frame !== 'number') return;
    if (ack.frame <= this.lastAckFrame) return;

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
      console.log(`Calculated frame offset: ${this.frameOffset}`);
    }

    // Find the input entry with the matching frame in our history
    const matchingEntry = this.inputHistory.find(entry => entry.frame === ack.frame);
    
    let correctionApplied = false;

    if (!matchingEntry) {
      // If the frame is not in history, only apply authority when the ack frame is almost current
      const frameDiff = ack.frame - this.inputFrameCounter; // negative if ack is behind
      if (Math.abs(frameDiff) <= 1) {
        console.log(`Frame ${ack.frame} not found in history but close to current (diff ${frameDiff}), applying server authority`);
        if (typeof ack.x === 'number' && typeof ack.y === 'number') {
          this.sceneMap.physic.updateHitbox(myId, ack.x, ack.y, currentPlayer.hitbox().w, currentPlayer.hitbox().h);
          correctionApplied = true;
        }
        if (typeof ack.direction !== 'undefined') {
          currentPlayer.changeDirection(ack.direction);
          correctionApplied = true;
        }
      } else {
        // Too old or too far in future: ignore to avoid false corrections
        console.log(`Frame ${ack.frame} not present (diff ${frameDiff}), ignoring ack to avoid false correction`);
      }
    } else {
      // Compare server position with our predicted position for that frame
      const POSITION_TOLERANCE = Math.max(3, (currentPlayer as any).speed?.() ?? 4); // tolerate at least one tile-speed step
      let positionsMatch = true;
      
      if (typeof ack.x === 'number' && typeof ack.y === 'number') {
        const xDiff = Math.abs(ack.x - matchingEntry.resultingX);
        const yDiff = Math.abs(ack.y - matchingEntry.resultingY);
        positionsMatch = xDiff <= POSITION_TOLERANCE && yDiff <= POSITION_TOLERANCE;
        
        if (!positionsMatch) {
          console.log(`Frame ${ack.frame}: server(${ack.x}, ${ack.y}) vs client(${matchingEntry.resultingX}, ${matchingEntry.resultingY}), diff(${xDiff}, ${yDiff}) - applying server authority`);
        } else {
          console.log(`Frame ${ack.frame}: positions match, no correction needed`);
        }
      }
      
      // Check direction match
      if (typeof ack.direction !== 'undefined') {
        const directionMatch = ack.direction === matchingEntry.resultingDirection;
        if (!directionMatch) {
          console.log(`Frame ${ack.frame}: direction mismatch, server(${ack.direction}) vs client(${matchingEntry.resultingDirection}) - applying server authority`);
          positionsMatch = false;
        }
      }
      
      // Apply server authority only if positions/direction differ significantly
      if (!positionsMatch) {
        if (typeof ack.x === 'number' && typeof ack.y === 'number') {
          this.sceneMap.physic.updateHitbox(myId, ack.x, ack.y, currentPlayer.hitbox().w, currentPlayer.hitbox().h);
          correctionApplied = true;
        }
        if (typeof ack.direction !== 'undefined') {
          currentPlayer.changeDirection(ack.direction);
          correctionApplied = true;
        }
      }
    }

    // Clean up input history: remove entries up to and including the acked frame
    const pendingToReplay = this.inputHistory.filter(entry => entry.frame > ack.frame).sort((a, b) => a.frame - b.frame);
    this.inputHistory = pendingToReplay;

    // If we applied a correction, replay remaining inputs locally to realign prediction
    if (correctionApplied && pendingToReplay.length > 0) {
      this.replayUnackedInputsFromFrame(ack.frame);
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

  /**
   * Remove x,y positions from synchronization data
   * 
   * Creates a copy of the data with x,y positions removed to avoid
   * double application when loading to sceneMap.
   * 
   * @param data - Synchronization data containing players and events
   * @returns Copy of data with x,y positions removed
   * 
   * @example
   * ```ts
   * // Remove positions before loading to sceneMap
   * const dataWithoutPositions = this.removePositionsFromData(filteredData);
   * ```
   */
  private removePositionsFromData(data: any): any {
    // Create a deep copy of the data to avoid mutating the original
    const dataCopy = JSON.parse(JSON.stringify(data));

    // Remove x,y from players only for current player; keep for others
    if (dataCopy.players) {
      for (const [playerId, playerData] of Object.entries(dataCopy.players as Record<string, any>)) {
        if (playerId === this.playerIdSignal()) {
          delete (dataCopy.players as any)[playerId].x;
          delete (dataCopy.players as any)[playerId].y;
        }
      }
    }

    // Remove x,y from events
    if (dataCopy.events) {
      for (const [eventId, eventData] of Object.entries(dataCopy.events as Record<string, any>)) {
        delete (dataCopy.events as any)[eventId].x;
        delete (dataCopy.events as any)[eventId].y;
      }
    }

    return dataCopy;
  }

  /**
   * Update physics hitboxes from synchronization data
   * 
   * This method iterates through synchronization data and updates hitboxes
   * directly in the physics system. Called after sceneMap has been updated
   * to ensure physics bodies are synchronized with the latest positions.
   * 
   * @param data - Synchronization data containing players and events with positions
   * 
   * @example
   * ```ts
   * // Called after sceneMap has been updated
   * this.updatePhysicsFromSync(filteredData);
   * ```
   */
  private updatePhysicsFromSync(data: any): void {
    const serverTs = (data && typeof data.timestamp === 'number') ? data.timestamp : Date.now();
    // Helper function to update entity physics hitbox
    const updateEntityPhysics = (entityId: string, entityData: any, entityType: 'player' | 'event') => {
      if (entityData.x !== undefined && entityData.y !== undefined) {
        // Drop stale updates for players to avoid back-and-forth under lag
        if (entityType === 'player') {
          const lastTs = this.lastRemoteServerTs.get(entityId) || 0;
          if (serverTs < lastTs) {
            return;
          }
          this.lastRemoteServerTs.set(entityId, serverTs);
        }
        const existingEntity = this.sceneMap.getObjectById(entityId);
        if (existingEntity) {
          this.sceneMap.physic.updateHitbox(
            entityId,
            entityData.x,
            entityData.y,
            existingEntity.hitbox().w,
            existingEntity.hitbox().h
          );
        }
      }
    };

    // Update player positions in physics system
    if (data.players) {
      for (const [playerId, playerData] of Object.entries(data.players as Record<string, any>)) {
        updateEntityPhysics(playerId, playerData, 'player');
      }
    }

    // Update event positions in physics system
    if (data.events) {
      for (const [eventId, eventData] of Object.entries(data.events as Record<string, any>)) {
        updateEntityPhysics(eventId, eventData, 'event');
      }
    }
  }
}
