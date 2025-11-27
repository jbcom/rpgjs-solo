import { Action, MockConnection, Request, Room, RoomOnJoin } from "@signe/room";
import { Hooks, IceMovement, ModulesToken, ProjectileMovement, ProjectileType, RpgCommonMap, ZoneData, Direction, RpgCommonPlayer } from "@rpgjs/common";
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

  constructor() {
    super();
    this.hooks.callHooks("server-map-onStart", this).subscribe();
    this.throttleSync = this.isStandalone ? 0 : 50; // Reduced from 100ms to 50ms for better responsiveness
    this.throttleStorage = this.isStandalone ? 0 : 1000;
    this.sessionExpiryTime = 1000 * 60 * 5; //5 minutes
    this.loop();
  }

  // autoload by @signe/room
  interceptorPacket(player: RpgPlayer, packet: any, conn: MockConnection) {
    let obj: any = {}

    if (!player) {
      return null
    }

    // Add timestamp to sync packets for client-side prediction reconciliation
    if (packet && typeof packet === 'object') {
      obj.timestamp = Date.now();

      // Add ack info: last processed frame and authoritative position
      if (player) {
        const lastFramePositions = player._lastFramePositions;
        obj.ack = {
          frame: lastFramePositions?.frame ?? player.pendingInputs.length,
          x: lastFramePositions?.position?.x ?? player.x(),
          y: lastFramePositions?.position?.y ?? player.y(),
          direction: lastFramePositions?.position?.direction ?? player.direction(),
        };
      }
    }

    if (typeof packet.value == 'string') {
      return packet
    }

    return {
      ...packet,
      value: {
        ...packet.value,
        ...obj
      }
    };
  }

  onJoin(player: RpgPlayer, conn: MockConnection) {
    player.map = this;
    player.context = context;
    player.conn = conn;
    player._onInit()
    this.dataIsReady$.pipe(
      finalize(() => {
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
    // Get collisions using the helper method from RpgCommonMap
    const collisions = (this as any).getCollisions(player.id);
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
    } catch { }
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
   * This method processes all pending inputs for a player while performing
   * anti-cheat validation to prevent time manipulation and frame skipping.
   * It validates the time deltas between inputs and ensures they are within
   * acceptable ranges.
   * 
   * ## Architecture
   * 
   * **Important**: This method only updates entity velocities - it does NOT step
   * the physics engine. Physics simulation is handled centrally by the game loop
   * (`tick$` -> `runFixedTicks`). This ensures:
   * - Consistent physics timing (60fps fixed timestep)
   * - No double-stepping when multiple inputs are processed
   * - Deterministic physics regardless of input frequency
   * 
   * @param playerId - The ID of the player to process inputs for
   * @param controls - Optional anti-cheat configuration
   * @returns Promise containing the player and processed input strings
   * 
   * @example
   * ```ts
   * // Process inputs with default anti-cheat settings
   * const result = await map.processInput('player1');
   * console.log('Processed inputs:', result.inputs);
   * 
   * // Process inputs with custom anti-cheat configuration
   * const result = await map.processInput('player1', {
   *   maxTimeDelta: 100,
   *   maxFrameDelta: 5,
   *   minTimeBetweenInputs: 16,
   *   enableAntiCheat: true
   * });
   * ```
   */
  async processInput(playerId: string, controls?: Controls): Promise<{
    player: RpgPlayer,
    inputs: string[]
  }> {
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
    let lastProcessedTime = player.lastProcessedInputTs || 0;
    let lastProcessedFrame = 0;

    // Sort inputs by frame number to ensure proper order
    player.pendingInputs.sort((a, b) => (a.frame || 0) - (b.frame || 0));

    let hasProcessedInputs = false;

    // Process all pending inputs
    while (player.pendingInputs.length > 0) {
      const input = player.pendingInputs.shift();

      if (!input || typeof input.frame !== 'number') {
        continue;
      }

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

      // Process the input - update velocity based on the latest input
      if (input.input) {
        await this.movePlayer(player, input.input);
        processedInputs.push(input.input);
        hasProcessedInputs = true;
        lastProcessedTime = input.timestamp || Date.now();
      }

      // Update tracking variables
      lastProcessedFrame = input.frame;
    }

    // Physics is now handled by the main game loop (tick$ -> runFixedTicks)
    // We only update timestamps and handle idle timeout here
    // The physics step will be executed in the next tick cycle
    if (hasProcessedInputs) {
      player.lastProcessedInputTs = lastProcessedTime;
    } else {
      const idleTimeout = Math.max(config.minTimeBetweenInputs * 4, 50);
      const lastTs = player.lastProcessedInputTs || 0;
      if (lastTs > 0 && Date.now() - lastTs > idleTimeout) {
        (this as any).stopMovement(player);
        player.lastProcessedInputTs = 0;
      }
    }

    return {
      player,
      inputs: processedInputs
    };
  }

  private loop() {
    setInterval(async () => {
      for (const player of this.getPlayers()) {
        if (player.pendingInputs.length > 0) {
          const anyPlayer = player as RpgPlayer;
          if (!anyPlayer._isProcessingInputs) {
            anyPlayer._isProcessingInputs = true;
            await this.processInput(player.id).finally(() => {
              anyPlayer._isProcessingInputs = false;
            });
          }
        }
      }
    }, 50); // Increased frequency from 100ms to 50ms for better responsiveness
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
    //eventInstance.applyFrames()
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