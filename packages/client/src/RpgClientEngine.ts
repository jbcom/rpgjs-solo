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
  // Keep a history of client inputs to support reconciliation and replay
  private inputHistory: Array<{ input: Direction; timestamp: number }> = [];
  // Queue of inputs to replay after applying a server snapshot
  private pendingReplayInputs: Direction[] = [];

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
      
      // Clean up old prediction states every 60 ticks (approximately every second at 60fps)
      if (tick % 60 === 0) {
        this.cleanupOldPredictionStates();
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
      const filteredData = this.applyClientSidePredictionFilter(data);
      
      // Remove x,y from filteredData before loading to sceneMap
      const dataWithoutPositions = this.removePositionsFromData(filteredData);
      
      this.hooks.callHooks("client-sceneMap-onChanges", this.sceneMap, { partial: dataWithoutPositions }).subscribe();
      load(this.sceneMap, dataWithoutPositions, true);

      // Update physics hitboxes after sceneMap has been updated
      this.updatePhysicsFromSync(filteredData);

      // After applying server snapshot, replay pending inputs if any
      if (this.pendingReplayInputs.length > 0) {
        const currentPlayerObj = this.sceneMap.getCurrentPlayer();
        if (currentPlayerObj) {
          for (const dir of this.pendingReplayInputs) {
            this.sceneMap.movePlayer(currentPlayerObj, dir);
          }
        }
        this.pendingReplayInputs = [];
      }
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
      const playerLastProcessedTs: number | undefined = (playerData as any).lastProcessedInputTs ?? serverLastProcessedInputTs;
      
      // Decide reconciliation based on acked inputs (authoritative approach)
      const latestInputTs = this.inputHistory.length > 0 ? this.inputHistory[this.inputHistory.length - 1].timestamp : undefined;
      const hasUnackedInputs = typeof latestInputTs === 'number' && typeof playerLastProcessedTs === 'number' && latestInputTs > playerLastProcessedTs;
      const currentPlayerObj = this.sceneMap.getCurrentPlayer();
      const currentX = currentPlayerObj?.x();
      const currentY = currentPlayerObj?.y();
      const currentDir = currentPlayerObj?.direction();

      if (!hasUnackedInputs) {
        // All inputs acked (or none): ignore server movement state to avoid snaps
        delete filteredPlayerData.x;
        delete filteredPlayerData.y;
        delete filteredPlayerData.direction;
      }
      else {
        // There are unacked inputs: if server state equals our current predicted state, ignore; else apply server then replay
        const sameAsPredicted =
          (playerData.x === currentX) &&
          (playerData.y === currentY) &&
          (playerData.direction === currentDir);

        if (sameAsPredicted) {
          delete filteredPlayerData.x;
          delete filteredPlayerData.y;
          delete filteredPlayerData.direction;
        }
        else {
          // Apply server snapshot and schedule replay of remaining inputs after load()
          const remaining = this.inputHistory.filter(e => typeof playerLastProcessedTs === 'number' ? e.timestamp > playerLastProcessedTs : true);
          this.pendingReplayInputs = remaining.map(e => e.input);
          // Also drop acked inputs from the history now
          if (typeof playerLastProcessedTs === 'number') {
            this.inputHistory = this.inputHistory.filter(e => e.timestamp > playerLastProcessedTs);
          }
        }
      }
      
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
      
      // If server acknowledged inputs up to playerLastProcessedTs, drop them from history and replay the rest
      if (typeof playerLastProcessedTs === 'number') {
        // Remove acknowledged inputs
        this.inputHistory = this.inputHistory.filter(e => e.timestamp > playerLastProcessedTs);
        
        // If we applied server position (i.e., we did NOT filter out x/y), we need to replay remaining inputs
        const appliedServerPosition = filteredPlayerData.x !== undefined || filteredPlayerData.y !== undefined;
        if (appliedServerPosition && this.inputHistory.length > 0) {
          const currentPlayerObj = this.sceneMap.getCurrentPlayer();
          if (currentPlayerObj) {
            for (const entry of this.inputHistory) {
              // Re-apply predicted moves locally without emitting to server
              this.sceneMap.movePlayer(currentPlayerObj, entry.input);
            }
          }
        }
      }
    }
    
    return filteredData;
  }

  async processInput({ input }: { input: Direction }) {
    const timestamp = Date.now();
    this.hooks.callHooks("client-engine-onInput", this, { input, playerId: this.playerId }).subscribe();
    
    // Send movement input with timestamp to server
    this.webSocket.emit('move', { 
      input, 
      timestamp 
    });
    
    // Push into input history for future reconciliation
    this.inputHistory.push({ input, timestamp });
    
    const currentPlayer = this.sceneMap.getCurrentPlayer();
    if (currentPlayer) {
      // Store client prediction state before movement
      this.clientPredictionStates.set(this.playerId!, {
        x: currentPlayer.x(),
        y: currentPlayer.y(),
        direction: currentPlayer.direction(),
        animationName: currentPlayer.animationName(),
        timestamp
      });
      
      await this.sceneMap.movePlayer(currentPlayer, input);
      
      // Update client prediction state after movement with same timestamp
      this.clientPredictionStates.set(this.playerId!, {
        x: currentPlayer.x(),
        y: currentPlayer.y(),
        direction: currentPlayer.direction(),
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
   * Removes old prediction states to prevent memory leaks.
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
    this.lastServerTimestamp = 0;
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

    // Remove x,y from players
    if (dataCopy.players) {
      for (const [playerId, playerData] of Object.entries(dataCopy.players as Record<string, any>)) {
        delete (dataCopy.players as any)[playerId].x;
        delete (dataCopy.players as any)[playerId].y;
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
    // Helper function to update entity physics hitbox
    const updateEntityPhysics = (entityId: string, entityData: any, entityType: 'player' | 'event') => {
      if (entityData.x !== undefined && entityData.y !== undefined) {
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
