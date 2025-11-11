import { Action, MockConnection, Request, Room, RoomOnJoin } from "@signe/room";
import { Hooks, IceMovement, ModulesToken, ProjectileMovement, ProjectileType, RpgCommonMap, Direction, RpgCommonPlayer } from "@rpgjs/common";
import { WorldMapsManager, type WorldMapConfig } from "@rpgjs/common";
import { RpgPlayer, RpgEvent } from "../Player/Player";
import { generateShortUUID, sync, type, users } from "@signe/sync";
import { signal } from "@signe/reactive";
import { inject } from "@signe/di";
import { context } from "../core/context";;
import { finalize, lastValueFrom } from "rxjs";
import { Subject } from "rxjs";
import { BehaviorSubject } from "rxjs";
import { COEFFICIENT_ELEMENTS, DAMAGE_CRITICAL, DAMAGE_PHYSIC, DAMAGE_SKILL } from "../presets";
import { z } from "zod";

/**
 * Zone data structure for shape detection events
 */
export interface ZoneData {
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  properties?: Record<string, any>;
}

/**
 * Interface for input controls configuration
 * 
 * Defines the structure for input validation and anti-cheat controls
 */
export interface Controls {
  /** Maximum allowed time delta between inputs in milliseconds */
  maxTimeDelta?: number;
  /** Maximum allowed frame delta between inputs */
  maxFrameDelta?: number;
  /** Minimum time between inputs in milliseconds */
  minTimeBetweenInputs?: number;
  /** Whether to enable anti-cheat validation */
  enableAntiCheat?: boolean;
}

/**
 * Zod schema for validating map update request body
 * 
 * This schema ensures that the required fields are present and properly typed
 * when updating a map configuration.
 */
const MapUpdateSchema = z.object({
  /** Configuration object for the map (optional) */
  config: z.any().optional(),
  /** Damage formulas configuration (optional) */
  damageFormulas: z.any().optional(),
  /** Unique identifier for the map (required) */
  id: z.string(),
  /** Width of the map in pixels (required) */
  width: z.number(),
  /** Height of the map in pixels (required) */
  height: z.number(),
});

/**
 * Interface representing hook methods available for map events
 * 
 * These hooks are triggered at specific moments during the event lifecycle
 */
export interface EventHooks {
  /** Called when the event is first initialized */
  onInit?: () => void;
  /** Called when the event properties change */
  onChanges?: (player: RpgPlayer) => void;
  /** Called when a player performs an action on this event */
  onAction?: (player: RpgPlayer) => void;
  /** Called when a player touches this event */
  onPlayerTouch?: (player: RpgPlayer) => void;
  /** Called when a player enters a shape */
  onInShape?: (zone: ZoneData, player: RpgPlayer) => void;
  /** Called when a player exits a shape */
  onOutShape?: (zone: ZoneData, player: RpgPlayer) => void;

  onDetectInShape?: (player: RpgPlayer, shape: ZoneData) => void;
  onDetectOutShape?: (player: RpgPlayer, shape: ZoneData) => void;
}

/** Type for event class constructor */
export type EventConstructor = new () => RpgPlayer;

/** Options for positioning and defining an event on the map */
export type EventPosOption = {
  /** ID of the event */
  id?: string,

  /** X position of the event on the map */
  x: number,
  /** Y position of the event on the map */
  y: number,
  /** 
   * Event definition - can be either:
   * - A class that extends RpgPlayer
   * - An object with hook methods
   */
  event: EventConstructor | (EventHooks & Record<string, any>)
}

@Room({
  path: "map-{id}"
})
export class RpgMap extends RpgCommonMap<RpgPlayer> implements RoomOnJoin {
  @users(RpgPlayer) players = signal({});
  @sync(RpgPlayer) events = signal({});
  database = signal({});
  maps: any[] = []
  dataIsReady$ = new BehaviorSubject<void>(undefined);
  globalConfig: any = {}
  damageFormulas: any = {}
  
  // Server authoritative tick counter for deterministic simulation
  private serverTickCount: number = 0;
  private readonly SERVER_TICK_RATE = 60; // 60 ticks per second
  private readonly TICK_MS = 1000 / 60; // 16.67ms per tick
  
  constructor() {
    super();
    this.hooks.callHooks("server-map-onStart", this).subscribe();
    this.throttleSync = this.isStandalone ? 0 : 50; // Reduced from 100ms to 50ms for better responsiveness
    this.throttleStorage = this.isStandalone ? 0 : 1000;
    this.sessionExpiryTime = 1000 * 60 * 5; //5 minutes
  }

  // autoload by @signe/room
  interceptorPacket(player: RpgPlayer, packet: any, conn: MockConnection) {
    let obj: any = {}

    if (!player) {
      return null
    }

    // Add timestamp and serverTick to sync packets for client-side prediction reconciliation
    if (packet && typeof packet === 'object') {
      obj.timestamp = Date.now();
      obj.serverTick = this.serverTickCount; // Server authoritative tick counter

      // Add ack info: last processed frame and authoritative position at this server tick
      if (player) {
        const lastFramePositions = player._lastFramePositions;
        obj.ack = {
          frame: lastFramePositions?.frame ?? 0,
          serverTick: this.serverTickCount, // Tick at which this state is valid
          x: lastFramePositions?.position?.x ?? player.x(),
          y: lastFramePositions?.position?.y ?? player.y(),
          direction: lastFramePositions?.position?.direction ?? player.direction(),
        };

        console.debug(
          `[ServerTick ${this.serverTickCount}] Sending snapshot to player ${player.id}: ackFrame=${obj.ack.frame} position=(${obj.ack.x?.toFixed?.(2) ?? obj.ack.x}, ${obj.ack.y?.toFixed?.(2) ?? obj.ack.y})`
        );
      }
    }

    return {
      ...packet,
      value: (typeof packet.value === 'object' ? {
          ...(packet.value),
          ...obj
        } : packet.value)
    };
  }

  onJoin(player: RpgPlayer, conn: MockConnection) {
    player.map = this;
    player.context = context;
    player.conn = conn;
    player._onInit()
    this.dataIsReady$.pipe(
      finalize(() => {
        player.applyFrames()
        this.hooks
          .callHooks("server-player-onJoinMap", player, this)
          .subscribe();
      })
    ).subscribe();
  }

  onLeave(player: RpgPlayer, conn: MockConnection) {
    this.hooks
      .callHooks("server-player-onLeaveMap", player, this)
      .subscribe();
    player.pendingInputs = [];
  }

  get hooks() {
    return inject<Hooks>(context, ModulesToken);
  }

  get widthPx(): number {
    return this.data()?.width ?? 0
  }

  get heightPx(): number {
    return this.data()?.height ?? 0
  }

  get id(): string {
    return this.data()?.id ?? ''
  }

  get worldX(): number {
    const worldMaps = this.getWorldMapsManager?.();
    return worldMaps?.getMapInfo(this.id)?.worldX ?? 0
  }
  get worldY(): number {
    const worldMaps = this.getWorldMapsManager?.();
    return worldMaps?.getMapInfo(this.id)?.worldY ?? 0
  }

  @Action('gui.interaction')
  guiInteraction(player: RpgPlayer, value) {
    //this.hooks.callHooks("server-player-guiInteraction", player, value);
    player.syncChanges();
  }

  @Action('gui.exit')
  guiExit(player: RpgPlayer, { guiId, data }) {
    player.removeGui(guiId, data)
  }

  @Action('action')
  onAction(player: RpgPlayer, action: any) {
    const collisions = this.physic.getCollisions(player.id)
    const events: (RpgEvent | undefined)[] = collisions.map(id => this.getEvent(id))
    if (events.length > 0) {
      events.forEach(event => {
        event?.execMethod('onAction', [player, action]);
      });
    }
    player.execMethod('onInput', [action]);
  }

  @Action('move')
  async onInput(player: RpgPlayer, input: any) {
    if (typeof input?.frame === 'number') {
      // Check if we already have this frame to avoid duplicates
      const existingInput = player.pendingInputs.find(pending => pending.frame === input.frame);
      if (existingInput) {
        return; // Skip duplicate frame
      }
      
      player.pendingInputs.push({
        input: input.input,
        frame: input.frame,
        timestamp: input.timestamp || Date.now(),
      });
    }
  }

  /**
   * Handle ping request from client for synchronization
   * 
   * Responds with server tick and client frame information to allow
   * the client to calculate RTT and frame offset for accurate prediction reconciliation.
   * 
   * ## Design
   * 
   * - Receives client timestamp and frame counter
   * - Responds immediately with current serverTickCount
   * - Client uses this to measure RTT and calculate frame offset
   * - Enables accurate mapping between client frames and server ticks
   * 
   * @param player - The player sending the ping
   * @param data - Ping data containing clientTime and clientFrame
   * 
   * @example
   * ```ts
   * // Automatically called when client sends ping
   * // Server responds with: { serverTick, clientFrame, clientTime }
   * ```
   */
  @Action('ping')
  async onPing(player: RpgPlayer, data: { clientTime: number; clientFrame: number }) {
    player.conn?.send({
      type: 'pong',
      value: {
        serverTick: this.serverTickCount,
        clientFrame: data.clientFrame,
        clientTime: data.clientTime
      }
    });
  }

  @Request({
    path: "/map/update",
    method: "POST"
  }, MapUpdateSchema as any)
  async updateMap(request: Request) {
    const map = await request.json()
    this.data.set(map)
    this.globalConfig = map.config
    this.damageFormulas = map.damageFormulas || {};
    this.damageFormulas = {
        damageSkill: DAMAGE_SKILL,
        damagePhysic: DAMAGE_PHYSIC,
        damageCritical: DAMAGE_CRITICAL,
        coefficientElements: COEFFICIENT_ELEMENTS,
        ...this.damageFormulas
    }
    await lastValueFrom(this.hooks.callHooks("server-maps-load", this))
    await lastValueFrom(this.hooks.callHooks("server-worldMaps-load", this))

    map.events = map.events ?? []

    if (map.id) {
     const mapFound = this.maps.find(m => m.id === map.id)
     if (mapFound?.events) {
      map.events = [
        ...mapFound.events,
        ...map.events
       ] 
     }
    }

    await lastValueFrom(this.hooks.callHooks("server-map-onBeforeUpdate", map, this))

    this.loadPhysic()

    for (let event of map.events ?? []) {
      await this.createDynamicEvent(event);
    }

    this.dataIsReady$.complete()
    // TODO: Update map
  }

  /**
   * Update (or create) a world configuration and propagate to all maps in that world
   * 
   * Body must contain the world config as defined by Tiled world import or an array of maps.
   * If the world does not exist yet for this scene, it is created (auto-create).
   * 
   * Expected payload examples:
   * - { id: string, maps: WorldMapConfig[] }
   * - WorldMapConfig[]
   */
  @Request({
    path: "/world/:id/update",
    method: "POST",
  })
  async updateWorld(request: Request) {
    // Extract world id from URL: /world/:id/update
    let worldId = '';
    try {
      const reqUrl = (request as any).url as string;
      const urlObj = new URL(reqUrl, 'http://localhost');
      const parts = urlObj.pathname.split('/');
      // ['', 'world', ':id', 'update'] → index 2
      worldId = parts[2] ?? '';
    } catch {}
    const payload = await request.json();

    // Normalize input to array of WorldMapConfig
    const mapsConfig: WorldMapConfig[] = Array.isArray(payload)
      ? payload
      : payload?.maps ?? [];

    // Ensure map sizes are present; fallback to current map data when ID matches
    const normalized: WorldMapConfig[] = mapsConfig.map((m: any) => {
      return {
        id: m.id,
        worldX: m.worldX ?? m.x ?? 0,
        worldY: m.worldY ?? m.y ?? 0,
        width: m.width ?? m.widthPx ?? this.data()?.width ?? 0,
        height: m.height ?? m.heightPx ?? this.data()?.height ?? 0,
        tileWidth: m.tileWidth ?? this.tileWidth ?? 32,
        tileHeight: m.tileHeight ?? this.tileHeight ?? 32,
      } as WorldMapConfig;
    });

    await this.updateWorldMaps(worldId, normalized);
    return { ok: true } as any;
  }

  /**
   * Process pending inputs for a player with anti-cheat validation
   * 
   * This method processes all pending inputs for a player during the current server tick.
   * It performs anti-cheat validation to prevent time manipulation and frame skipping,
   * validates time deltas between inputs, and ensures they are within acceptable ranges.
   * After processing, it saves the last frame position for use in packet interception.
   * 
   * ## Design
   * 
   * - Executes **synchronously** within the physics tick loop for determinism
   * - Sorts inputs by client frame number to maintain causal order
   * - Applies anti-cheat validation if enabled (frame delta, time delta limits)
   * - Reads authoritative position from physics body after processing
   * - Associates processed inputs with current serverTickCount
   * 
   * @param playerId - The ID of the player to process inputs for
   * @param controls - Optional anti-cheat configuration
   * @returns Object containing the player and processed input strings
   * 
   * @example
   * ```ts
   * // Process inputs with default anti-cheat settings
   * const result = map.processInputSync('player1');
   * console.log('Processed inputs:', result.inputs);
   * 
   * // Process inputs with custom anti-cheat configuration
   * const result = map.processInputSync('player1', {
   *   maxTimeDelta: 100,
   *   maxFrameDelta: 5,
   *   minTimeBetweenInputs: 16,
   *   enableAntiCheat: true
   * });
   * ```
   */
  processInputSync(playerId: string, controls?: Controls): {
    player: RpgPlayer,
    inputs: string[]
  } {
    const player = this.getPlayer(playerId);
    
    if (!player) {
      throw new Error(`Player ${playerId} not found`);
    }
    
    if (!player.isConnected()) {
      player.pendingInputs = [];
      return {
        player,
        inputs: []
      }
    }

    const processedInputs: string[] = [];
    const defaultControls: Required<Controls> = {
      maxTimeDelta: 1000, // 1 second max between inputs
      maxFrameDelta: 10,  // Max 10 frames skipped
      minTimeBetweenInputs: 16, // ~60fps minimum
      enableAntiCheat: false
    };

    const config = { ...defaultControls, ...controls };
    let lastProcessedTime = 0;
    let lastProcessedFrame = 0;

    // Sort inputs by frame number to ensure proper order
    player.pendingInputs.sort((a, b) => (a.frame || 0) - (b.frame || 0));

    const pendingCount = player.pendingInputs.length;
    if (pendingCount > 0) {
      console.debug(`[ServerTick ${this.serverTickCount}] Player ${playerId} pending inputs: ${pendingCount}`);
    }

    // Process all pending inputs for this tick
    while (player.pendingInputs.length > 0) {
      const input = player.pendingInputs.shift();
      
      if (!input || typeof input.frame !== 'number') {
        continue;
      }

      console.debug(
        `[ServerTick ${this.serverTickCount}] Processing input frame ${input.frame} for player ${playerId} (command=${input.input})`
      );

      // Anti-cheat validation
      if (config.enableAntiCheat) {
        // Check frame delta
        if (input.frame > lastProcessedFrame + config.maxFrameDelta) {
          // Reset to last valid frame
          input.frame = lastProcessedFrame + 1;
        }

        // Check time delta if timestamp is available
        if (input.timestamp && lastProcessedTime > 0) {
          const timeDelta = input.timestamp - lastProcessedTime;
          if (timeDelta > config.maxTimeDelta) {
            input.timestamp = lastProcessedTime + config.minTimeBetweenInputs;
          }
        }

        // Check minimum time between inputs
        if (input.timestamp && lastProcessedTime > 0) {
          const timeDelta = input.timestamp - lastProcessedTime;
          if (timeDelta < config.minTimeBetweenInputs) {
            continue;
          }
        }
      }

      // Skip if frame is too old (more than 10 frames behind)
      if (input.frame < lastProcessedFrame - 10) {
        continue;
      }

      // Process the input synchronously within the tick
      if (input.input) {
        this.movePlayerSync(player, input.input);
        processedInputs.push(input.input);
      }

      // Update tracking variables
      lastProcessedTime = input.timestamp || Date.now();
      lastProcessedFrame = input.frame;
    }

    // Save last frame position for packet interception
    // IMPORTANT: read from physics body (authoritative), not from signals that are updated on next tick
    const lastFrame = lastProcessedFrame || 0;
    const body = this.physic.getBody(player.id);
    let posX = player.x();
    let posY = player.y();
    if (body) {
      const width = body.width ?? player.hitbox().w;
      const height = body.height ?? player.hitbox().h;
      posX = body.position.x - width / 2;
      posY = body.position.y - height / 2;
    }
    player._lastFramePositions = {
      frame: lastFrame,
      position: { 
        x: posX, 
        y: posY,
        direction: player.direction()
      },
      serverTick: this.serverTickCount // Associate with current server tick
    };

    if (processedInputs.length > 0) {
      console.debug(
        `[ServerTick ${this.serverTickCount}] Player ${playerId} processed inputs: ${processedInputs.join(', ')}`
      );
      console.debug(
        `[ServerTick ${this.serverTickCount}] Player ${playerId} authoritative position=(${posX.toFixed(2)}, ${posY.toFixed(2)}) direction=${player.direction()}`
      );
    }

    return {
      player,
      inputs: processedInputs
    };
  }

  /**
   * Synchronous player movement for deterministic server tick processing
   * 
   * This is a synchronous version of movePlayer() designed to be called within
   * the physics tick loop. It skips async operations like autoChangeMap to ensure
   * deterministic, frame-perfect physics simulation.
   * 
   * ## Design
   * 
   * - Executes synchronously within the fixed-timestep physics loop
   * - Updates player direction/facing immediately
   * - Delegates actual movement to the physics engine
   * - No async map changes (those should be handled separately)
   * 
   * @param player - The player to move
   * @param direction - Direction of movement
   * 
   * @example
   * ```ts
   * // Called from processInputSync during tick processing
   * this.movePlayerSync(player, Direction.Up);
   * ```
   */
  private movePlayerSync(player: RpgPlayer, direction: Direction): void {
    // Update player's intended direction
    if (typeof player.setIntendedDirection === 'function') {
      player.setIntendedDirection(direction);
    } else if (typeof player.changeDirection === 'function') {
      player.changeDirection(direction);
    }
    
    // Perform physics movement
    this.physic.moveBody(player, direction);
  }

  /**
   * Process all players' inputs in the current server tick
   * 
   * This method is called once per physics tick (60 Hz) to process all accumulated
   * player inputs in a deterministic, synchronous manner.
   * 
   * ## Design
   * 
   * - Called synchronously within the physics tick loop
   * - Processes inputs for all connected players
   * - Ensures deterministic simulation by processing inputs at fixed intervals
   * - No async operations to prevent timing drift
   * 
   * @example
   * ```ts
   * // Called automatically in the physics tick loop
   * this.tickSubscription = this.tick$.subscribe(({ delta }) => {
   *   this.serverTickCount++;
   *   this.processAllPlayerInputs(); // Process inputs first
   *   this.physic.update(delta);      // Then update physics
   * });
   * ```
   */
  private processAllPlayerInputs(): void {
    for (const player of this.getPlayers()) {
      if (player.pendingInputs.length > 0 && player.isConnected()) {
        try {
          this.processInputSync(player.id);
        } catch (error) {
          console.error(`Error processing inputs for player ${player.id}:`, error);
        }
      }
    }
  }

  /**
   * Override loadPhysic to integrate deterministic tick-based input processing
   * 
   * This method extends the base loadPhysic() from RpgCommonMap to add server-specific
   * tick processing that includes input handling within the physics loop.
   * 
   * ## Design
   * 
   * - Calls parent loadPhysic() to setup base physics
   * - Overrides the tick subscription to add input processing
   * - Ensures inputs are processed BEFORE physics update for determinism
   * - Increments serverTickCount on every tick
   * 
   * @example
   * ```ts
   * // Called when map is initialized or updated
   * await this.updateMap(request);
   * // loadPhysic() is called automatically
   * ```
   */
  override loadPhysic(): void {
    // Call parent to setup physics, hitboxes, and base subscriptions
    super.loadPhysic();
    
    // Unsubscribe from the base tick subscription
    if (this.tickSubscription) {
      this.tickSubscription.unsubscribe();
    }
    
    // Create new tick subscription with input processing
    this.tickSubscription = this.tick$.subscribe(({ delta }) => {
      // 1. Increment server tick counter
      this.serverTickCount++;
      
      // 2. Process all player inputs for this tick (BEFORE physics)
      this.processAllPlayerInputs();
      
      // 3. Update physics simulation
      this.physic.update(delta);
    });
  }

  /**
   * Get a world manager by id (if multiple supported in future)
   */
  getWorldMaps(id: string): WorldMapsManager | null {
    if (!this.worldMapsManager) return null;
    return this.worldMapsManager;
  }

  /**
   * Delete a world manager by id
   */
  deleteWorldMaps(id: string): boolean {
    if (!this.worldMapsManager) return false;
    // For now, clear the single manager
    this.worldMapsManager = undefined;
    return true;
  }

  /**
   * Create a world manager dynamically
   */
  createDynamicWorldMaps(world: { id?: string; maps: WorldMapConfig[] }): WorldMapsManager {
    const manager = new WorldMapsManager();
    manager.configure(world.maps);
    this.worldMapsManager = manager;
    return manager;
  }

  /**
   * Update world maps by id. Auto-create when missing.
   */
  async updateWorldMaps(id: string, maps: WorldMapConfig[]) {
    let world = this.getWorldMaps(id);
    if (!world) {
      world = this.createDynamicWorldMaps({ id, maps });
    } else {
      world.configure(maps);
    }
  }

  addInDatabase(id: string, data: any) {
    this.database()[id] = data;
  }

  /**
   * Creates a dynamic event on the map
   * 
   * This method handles both class-based events and object-based events with hooks.
   * For class-based events, it creates a new instance of the class.
   * For object-based events, it creates a dynamic class that extends RpgPlayer and 
   * implements the hook methods from the object.
   * 
   * @param eventObj - The event position and definition
   * 
   * @example
   * // Using a class-based event
   * class MyEvent extends RpgPlayer {
   *   onInit() {
   *     console.log('Event initialized');
   *   }
   * }
   * 
   * map.createDynamicEvent({
   *   x: 100,
   *   y: 200,
   *   event: MyEvent
   * });
   * 
   * // Using an object-based event
   * map.createDynamicEvent({
   *   x: 100,
   *   y: 200,
   *   event: {
   *     onInit() {
   *       console.log('Event initialized');
   *     },
   *     onPlayerTouch(player) {
   *       console.log('Player touched event');
   *     }
   *   }
   * });
   */
  async createDynamicEvent(eventObj: EventPosOption) {

    if (!eventObj.event) {
      // @ts-ignore
      eventObj = {
        event: eventObj 
      }
    }

    const value = await lastValueFrom(this.hooks.callHooks("server-event-onBeforeCreated", eventObj, this));
    value.filter(v => v).forEach(v => {
      eventObj = v
    })

    const { x, y, event } = eventObj;

    let id = eventObj.id || generateShortUUID()
    let eventInstance: RpgPlayer;

    if (this.events()[id]) {
      console.warn(`Event ${id} already exists on map`);
      return;
    }

    // Check if event is a constructor function (class)
    if (typeof event === 'function') {
      eventInstance = new event();
    } 
    // Handle event as an object with hooks
    else {
      // Create a new instance extending RpgPlayer with the hooks from the event object
      class DynamicEvent extends RpgEvent {
        onInit?: () => void;
        onChanges?: (player: RpgPlayer) => void;
        onAction?: (player: RpgPlayer) => void;
        onPlayerTouch?: (player: RpgPlayer) => void;
        onInShape?: (zone: ZoneData, player: RpgPlayer) => void;
        onOutShape?: (zone: ZoneData, player: RpgPlayer) => void;
        onDetectInShape?: (player: RpgPlayer, shape: ZoneData) => void;
        onDetectOutShape?: (player: RpgPlayer, shape: ZoneData) => void;

        constructor() {
          super();
          
          // Copy hooks from the event object
          const hookObj = event as EventHooks;
          if (hookObj.onInit) this.onInit = hookObj.onInit.bind(this);
          if (hookObj.onChanges) this.onChanges = hookObj.onChanges.bind(this);
          if (hookObj.onAction) this.onAction = hookObj.onAction.bind(this);
          if (hookObj.onPlayerTouch) this.onPlayerTouch = hookObj.onPlayerTouch.bind(this);
          if (hookObj.onInShape) this.onInShape = hookObj.onInShape.bind(this);
          if (hookObj.onOutShape) this.onOutShape = hookObj.onOutShape.bind(this);
          if (hookObj.onDetectInShape) this.onDetectInShape = hookObj.onDetectInShape.bind(this);
          if (hookObj.onDetectOutShape) this.onDetectOutShape = hookObj.onDetectOutShape.bind(this);
        }
      }

      eventInstance = new DynamicEvent();
    }

    eventInstance.map = this;
    eventInstance.context = context;

    eventInstance.x.set(x);
    eventInstance.y.set(y);
    eventInstance.applyFrames()
    if (event.name) eventInstance.name.set(event.name);
  
    this.events()[id] = eventInstance;

    await eventInstance.execMethod('onInit')
  }

  getEvent<T extends RpgPlayer>(eventId: string): T | undefined {
    return this.events()[eventId] as T
  }

  getPlayer(playerId: string): RpgPlayer | undefined {
    return this.players()[playerId]
  }

  getPlayers(): RpgPlayer[] {
    return Object.values(this.players())
  }

  getEvents(): RpgEvent[] {
    return Object.values(this.events())
  }

  getEventBy(cb: (event: RpgEvent) => boolean): RpgEvent | undefined {
    return this.getEventsBy(cb)[0]
  }

  getEventsBy(cb: (event: RpgEvent) => boolean): RpgEvent[] {
    return this.getEvents().filter(cb)
  }

  removeEvent(eventId: string) {
    delete this.events()[eventId]
  }

  /**
   * Display a component animation at a specific position on the map
   * 
   * This method broadcasts a component animation to all clients connected to the map,
   * allowing temporary visual effects to be displayed at any location on the map.
   * Component animations are custom Canvas Engine components that can display
   * complex effects with custom logic and parameters.
   * 
   * @param id - The ID of the component animation to display
   * @param position - The x, y coordinates where to display the animation
   * @param params - Parameters to pass to the component animation
   * 
   * @example
   * ```ts
   * // Show explosion at specific coordinates
   * map.showComponentAnimation("explosion", { x: 300, y: 400 }, {
   *   intensity: 2.5,
   *   duration: 1500
   * });
   * 
   * // Show area damage effect
   * map.showComponentAnimation("area-damage", { x: player.x, y: player.y }, {
   *   radius: 100,
   *   color: "red",
   *   damage: 50
   * });
   * 
   * // Show treasure spawn effect
   * map.showComponentAnimation("treasure-spawn", { x: 150, y: 200 }, {
   *   sparkle: true,
   *   sound: "treasure-appear"
   * });
   * ```
   */
  showComponentAnimation(id: string, position: { x: number, y: number }, params: any) {
    this.$broadcast({
      type: "showComponentAnimation",
      value: {
        id,
        params,
        position,
      },
    });
  }

  /**
   * Display a spritesheet animation at a specific position on the map
   * 
   * This method displays a temporary visual animation using a spritesheet at any
   * location on the map. It's a convenience method that internally uses showComponentAnimation
   * with the built-in 'animation' component. This is useful for spell effects, environmental
   * animations, or any visual feedback that uses predefined spritesheets.
   * 
   * @param position - The x, y coordinates where to display the animation
   * @param graphic - The ID of the spritesheet to use for the animation
   * @param animationName - The name of the animation within the spritesheet (default: 'default')
   * 
   * @example
   * ```ts
   * // Show explosion at specific coordinates
   * map.showAnimation({ x: 100, y: 200 }, "explosion");
   * 
   * // Show spell effect at player position
   * const playerPos = { x: player.x, y: player.y };
   * map.showAnimation(playerPos, "spell-effects", "lightning");
   * 
   * // Show environmental effect
   * map.showAnimation({ x: 300, y: 150 }, "nature-effects", "wind-gust");
   * 
   * // Show portal opening animation
   * map.showAnimation({ x: 500, y: 400 }, "portals", "opening");
   * ```
   */
  showAnimation(position: { x: number, y: number }, graphic: string, animationName: string = 'default') {
    this.showComponentAnimation('animation', position, {
      graphic,
      animationName,
    })
  }

  /**
   * Set the sync schema for the map
   * @param schema - The schema to set
   */
  /**
   * Configure runtime synchronized properties on the map
   *
   * Design
   * - Reads a schema object shaped like module props
   * - Creates typed sync signals with @signe/sync
   */
  setSync(schema: Record<string, any>) {
    for (let key in schema) {
      const initial = typeof schema[key]?.$initial !== 'undefined' ? schema[key].$initial : null;
      // Use type() directly with a plain object holder to avoid signal type mismatch
      const holder: any = {};
      this[key] = type(signal(initial) as any, key, {
        syncToClient: schema[key]?.$syncWithClient,
        persist: schema[key]?.$permanent,
      }, holder);
    }
  }
}

export interface RpgMap {
  $send: (conn: MockConnection, data: any) => void; 
  $broadcast: (data: any) => void;
  $sessionTransfer: (userOrPublicId: any | string, targetRoomId: string) => void;
}