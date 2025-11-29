import { Action, MockConnection, Request, Room, RoomOnJoin } from "@signe/room";
import { Hooks, IceMovement, ModulesToken, ProjectileMovement, ProjectileType, RpgCommonMap, Direction, RpgCommonPlayer, RpgShape } from "@rpgjs/common";
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
import { EntityState } from "@rpgjs/physic";

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
  onInShape?: (zone: RpgShape, player: RpgPlayer) => void;
  /** Called when a player exits a shape */
  onOutShape?: (zone: RpgShape, player: RpgPlayer) => void;

  onDetectInShape?: (player: RpgPlayer, shape: RpgShape) => void;
  onDetectOutShape?: (player: RpgPlayer, shape: RpgShape) => void;
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
  /** Internal: Map of shapes by name */
  private _shapes: Map<string, RpgShape> = new Map();
  /** Internal: Map of shape entity UUIDs to RpgShape instances */
  private _shapeEntities: Map<string, RpgShape> = new Map();

  constructor() {
    super();
    this.hooks.callHooks("server-map-onStart", this).subscribe();
    this.throttleSync = this.isStandalone ? 0 : 50; // Reduced from 100ms to 50ms for better responsiveness
    this.throttleStorage = this.isStandalone ? 0 : 1000;
    this.sessionExpiryTime = 1000 * 60 * 5; //5 minutes
    this.setupCollisionDetection();
    this.loop();
  }

  /**
   * Setup collision detection between players, events, and shapes
   * 
   * This method listens to physics collision events and triggers hooks:
   * - `onPlayerTouch` on events when a player collides with them
   * - `onInShape` on players and events when they enter a shape
   * - `onOutShape` on players and events when they exit a shape
   * 
   * ## Architecture
   * 
   * Uses the physics engine's collision event system to detect when entities collide.
   * When a collision is detected:
   * - Between a player and an event: triggers `onPlayerTouch` on the event
   * - Between a player/event and a shape: triggers `onInShape`/`onOutShape` hooks
   * 
   * @example
   * ```ts
   * // Event with onPlayerTouch hook
   * map.createDynamicEvent({
   *   x: 100,
   *   y: 200,
   *   event: {
   *     onPlayerTouch(player) {
   *       console.log(`Player ${player.id} touched this event!`);
   *     }
   *   }
   * });
   * 
   * // Player with onInShape hook
   * const player: RpgPlayerHooks = {
   *   onInShape(player: RpgPlayer, shape: RpgShape) {
   *     console.log('in', player.name, shape.name);
   *   },
   *   onOutShape(player: RpgPlayer, shape: RpgShape) {
   *     console.log('out', player.name, shape.name);
   *   }
   * };
   * ```
   */
  private setupCollisionDetection(): void {
    // Track collisions to avoid calling hooks multiple times for the same collision
    const activeCollisions = new Set<string>();
    const activeShapeCollisions = new Set<string>();

    // Listen to collision enter events
    this.physic.getEvents().onCollisionEnter((collision) => {
      const entityA = collision.entityA;
      const entityB = collision.entityB;

      // Create a unique key for this collision pair
      const collisionKey = entityA.uuid < entityB.uuid
        ? `${entityA.uuid}-${entityB.uuid}`
        : `${entityB.uuid}-${entityA.uuid}`;

      // Skip if we've already processed this collision
      if (activeCollisions.has(collisionKey)) {
        return;
      }

      // Check for shape collisions first
      const shapeA = this._shapeEntities.get(entityA.uuid);
      const shapeB = this._shapeEntities.get(entityB.uuid);

      if (shapeA || shapeB) {
        // One of the entities is a shape
        const shape = shapeA || shapeB;
        const otherEntity = shapeA ? entityB : entityA;
        
        if (shape) {
          const shapeKey = `${otherEntity.uuid}-${shape.name}`;
          if (!activeShapeCollisions.has(shapeKey)) {
            activeShapeCollisions.add(shapeKey);

            // Check if the other entity is a player or event
            const player = this.getPlayer(otherEntity.uuid);
            const event = this.getEvent(otherEntity.uuid);

            if (player) {
              // Trigger onInShape hook on player
              player.execMethod('onInShape', [player, shape]);
            }
            if (event) {
              // Trigger onInShape hook on event
              event.execMethod('onInShape', [shape, player || event]);
            }
          }
        }
        return;
      }

      // Check if one entity is a player and the other is an event
      const player = this.getPlayer(entityA.uuid) || this.getPlayer(entityB.uuid);
      if (!player) {
        return;
      }

      // Determine which entity is the event
      const eventId = player.id === entityA.uuid ? entityB.uuid : entityA.uuid;
      const event = this.getEvent(eventId);

      if (event) {
        // Mark this collision as processed
        activeCollisions.add(collisionKey);
        
        // Trigger the onPlayerTouch hook on the event
        event.execMethod('onPlayerTouch', [player]);
      }
    });

    // Listen to collision exit events to clean up tracking
    this.physic.getEvents().onCollisionExit((collision) => {
      const entityA = collision.entityA;
      const entityB = collision.entityB;

      const collisionKey = entityA.uuid < entityB.uuid
        ? `${entityA.uuid}-${entityB.uuid}`
        : `${entityB.uuid}-${entityA.uuid}`;

      // Check for shape collisions
      const shapeA = this._shapeEntities.get(entityA.uuid);
      const shapeB = this._shapeEntities.get(entityB.uuid);

      if (shapeA || shapeB) {
        // One of the entities is a shape
        const shape = shapeA || shapeB;
        const otherEntity = shapeA ? entityB : entityA;
        
        if (shape) {
          const shapeKey = `${otherEntity.uuid}-${shape.name}`;
          if (activeShapeCollisions.has(shapeKey)) {
            activeShapeCollisions.delete(shapeKey);

            // Check if the other entity is a player or event
            const player = this.getPlayer(otherEntity.uuid);
            const event = this.getEvent(otherEntity.uuid);

            if (player) {
              // Trigger onOutShape hook on player
              player.execMethod('onOutShape', [player, shape]);
            }
            if (event) {
              // Trigger onOutShape hook on event
              event.execMethod('onOutShape', [shape, player || event]);
            }
          }
        }
        return;
      }

      // Remove from active collisions so onPlayerTouch can be called again if they collide again
      activeCollisions.delete(collisionKey);
    });
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

  /**
   * Add data to the map's database
   * 
   * This method allows you to dynamically add items, classes, or any data to the map's database.
   * By default, if an ID already exists, the operation is ignored to prevent overwriting existing data.
   * 
   * @param id - Unique identifier for the data
   * @param data - The data to store (can be a class, object, or any value)
   * @param options - Optional configuration
   * @param options.force - If true, overwrites existing data even if ID already exists (default: false)
   * @returns true if data was added, false if ignored (ID already exists)
   * 
   * @example
   * ```ts
   * // Add an item class to the database
   * map.addInDatabase('Potion', PotionClass);
   * 
   * // Add an item object to the database
   * map.addInDatabase('custom-item', {
   *   name: 'Custom Item',
   *   price: 100
   * });
   * 
   * // Force overwrite existing data
   * map.addInDatabase('Potion', UpdatedPotionClass, { force: true });
   * ```
   */
  addInDatabase(id: string, data: any, options?: { force?: boolean }): boolean {
    const database = this.database();
    
    // Check if ID already exists
    if (database[id] !== undefined && !options?.force) {
      // Ignore the addition if ID exists and force is not enabled
      return false;
    }
    
    // Add or overwrite the data
    database[id] = data;
    return true;
  }

  /**
   * Remove data from the map's database
   * 
   * This method allows you to remove items or data from the map's database.
   * 
   * @param id - Unique identifier of the data to remove
   * @returns true if data was removed, false if ID didn't exist
   * 
   * @example
   * ```ts
   * // Remove an item from the database
   * map.removeInDatabase('Potion');
   * 
   * // Check if removal was successful
   * const removed = map.removeInDatabase('custom-item');
   * if (removed) {
   *   console.log('Item removed successfully');
   * }
   * ```
   */
  removeInDatabase(id: string): boolean {
    const database = this.database();
    
    // Check if ID exists
    if (database[id] === undefined) {
      return false;
    }
    
    // Remove the data
    delete database[id];
    return true;
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
      if (event.prototype.name) eventInstance.name.set(event.prototype.name);
    }
    // Handle event as an object with hooks
    else {
      // Create a new instance extending RpgPlayer with the hooks from the event object
      class DynamicEvent extends RpgEvent {
        onInit?: () => void;
        onChanges?: (player: RpgPlayer) => void;
        onAction?: (player: RpgPlayer) => void;
        onPlayerTouch?: (player: RpgPlayer) => void;
        onInShape?: (zone: RpgShape, player: RpgPlayer) => void;
        onOutShape?: (zone: RpgShape, player: RpgPlayer) => void;
        onDetectInShape?: (player: RpgPlayer, shape: RpgShape) => void;
        onDetectOutShape?: (player: RpgPlayer, shape: RpgShape) => void;

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
      if (event.name) eventInstance.name.set(event.name);
    }

    eventInstance.map = this;
    eventInstance.context = context;

    eventInstance.x.set(x);
    eventInstance.y.set(y);
    
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

  /**
   * Create a shape dynamically on the map
   * 
   * This method creates a static hitbox on the map that can be used for
   * collision detection, area triggers, or visual boundaries. The shape is
   * backed by the physics engine's static entity system for accurate collision detection.
   * 
   * ## Architecture
   * 
   * Creates a static entity (hitbox) in the physics engine at the specified position and size.
   * The shape is stored internally and can be retrieved by name. When players or events
   * collide with this hitbox, the `onInShape` and `onOutShape` hooks are automatically
   * triggered on both the player and the event.
   * 
   * @param obj - Shape configuration object
   * @param obj.x - X position of the shape (top-left corner) (required)
   * @param obj.y - Y position of the shape (top-left corner) (required)
   * @param obj.width - Width of the shape in pixels (required)
   * @param obj.height - Height of the shape in pixels (required)
   * @param obj.name - Name of the shape (optional, auto-generated if not provided)
   * @param obj.z - Z position/depth for rendering (optional)
   * @param obj.color - Color in hexadecimal format, shared with client (optional)
   * @param obj.collision - Whether the shape has collision (optional)
   * @param obj.properties - Additional custom properties (optional)
   * @returns The created RpgShape instance
   * 
   * @example
   * ```ts
   * // Create a simple rectangular shape
   * const shape = map.createShape({
   *   x: 100,
   *   y: 200,
   *   width: 50,
   *   height: 50,
   *   name: "spawn-zone"
   * });
   * 
   * // Create a shape with visual properties
   * const triggerZone = map.createShape({
   *   x: 300,
   *   y: 400,
   *   width: 100,
   *   height: 100,
   *   name: "treasure-area",
   *   color: "#FFD700",
   *   z: 1,
   *   collision: false,
   *   properties: {
   *     type: "treasure",
   *     value: 100
   *   }
   * });
   * 
   * // Player hooks will be triggered automatically
   * const player: RpgPlayerHooks = {
   *   onInShape(player: RpgPlayer, shape: RpgShape) {
   *     console.log('in', player.name, shape.name);
   *   },
   *   onOutShape(player: RpgPlayer, shape: RpgShape) {
   *     console.log('out', player.name, shape.name);
   *   }
   * };
   * ```
   */
  createShape(obj: {
    x: number;
    y: number;
    width: number;
    height: number;
    name?: string;
    z?: number;
    color?: string;
    collision?: boolean;
    properties?: Record<string, any>;
  }): RpgShape {
    const { x, y, width, height } = obj;
    
    // Validate required parameters
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new Error('Shape x and y must be numbers');
    }
    if (typeof width !== 'number' || width <= 0) {
      throw new Error('Shape width must be a positive number');
    }
    if (typeof height !== 'number' || height <= 0) {
      throw new Error('Shape height must be a positive number');
    }

    // Generate name if not provided
    const name = obj.name || generateShortUUID();

    // Check if shape with this name already exists
    if (this._shapes.has(name)) {
      throw new Error(`Shape with name "${name}" already exists`);
    }

    // Calculate center position for the static hitbox
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    // Create static entity (hitbox) in physics engine
    const entityId = `shape-${name}`;
    const entity = this.physic.createEntity({
      uuid: entityId,
      position: { x: centerX, y: centerY },
      width: width,
      height: height,
      mass: Infinity, // Static entity
      state: EntityState.Static,
      restitution: 0, // No bounce
    });
    entity.freeze(); // Ensure it's frozen

    // Build properties object
    const properties: Record<string, any> = {
      ...(obj.properties || {}),
    };
    if (obj.z !== undefined) properties.z = obj.z;
    if (obj.color !== undefined) properties.color = obj.color;
    if (obj.collision !== undefined) properties.collision = obj.collision;

    // Create RpgShape instance
    // Note: We use entityId as physicZoneId for compatibility, but it's actually an entity UUID
    const shape = new RpgShape({
      name: name,
      positioning: 'default',
      width: width,
      height: height,
      x: centerX,
      y: centerY,
      properties: properties,
      playerOwner: undefined, // Static shapes are not attached to players
      physicZoneId: entityId, // Store entity UUID for reference
      map: this,
    });

    // Store the shape
    this._shapes.set(name, shape);
    this._shapeEntities.set(entityId, shape);

    return shape;
  }

  /**
   * Delete a shape from the map
   * 
   * Removes a shape by its name and cleans up the associated static hitbox entity.
   * If the shape doesn't exist, the method does nothing.
   * 
   * @param name - Name of the shape to remove
   * @returns void
   * 
   * @example
   * ```ts
   * // Create and then remove a shape
   * const shape = map.createShape({
   *   x: 100,
   *   y: 200,
   *   width: 50,
   *   height: 50,
   *   name: "temp-zone"
   * });
   * 
   * // Later, remove it
   * map.removeShape("temp-zone");
   * ```
   */
  removeShape(name: string): void {
    const shape = this._shapes.get(name);
    if (!shape) {
      return;
    }

    // Remove entity from physics engine
    const entityId = (shape as any)._physicZoneId;
    const entity = this.physic.getEntityByUUID(entityId);
    if (entity) {
      this.physic.removeEntity(entity);
    }

    // Remove from internal storage
    this._shapes.delete(name);
    this._shapeEntities.delete(entityId);
  }

  /**
   * Get all shapes on the map
   * 
   * Returns an array of all shapes that have been created on this map,
   * regardless of whether they are static shapes or player-attached shapes.
   * 
   * @returns Array of RpgShape instances
   * 
   * @example
   * ```ts
   * // Create multiple shapes
   * map.createShape({ x: 0, y: 0, width: 50, height: 50, name: "zone1" });
   * map.createShape({ x: 100, y: 100, width: 50, height: 50, name: "zone2" });
   * 
   * // Get all shapes
   * const allShapes = map.getShapes();
   * console.log(allShapes.length); // 2
   * ```
   */
  getShapes(): RpgShape[] {
    return Array.from(this._shapes.values());
  }

  /**
   * Get a shape by its name
   * 
   * Returns a shape with the specified name, or undefined if no shape
   * with that name exists on the map.
   * 
   * @param name - Name of the shape to retrieve
   * @returns The RpgShape instance, or undefined if not found
   * 
   * @example
   * ```ts
   * // Create a shape with a specific name
   * map.createShape({
   *   x: 100,
   *   y: 200,
   *   width: 50,
   *   height: 50,
   *   name: "spawn-point"
   * });
   * 
   * // Retrieve it later
   * const spawnZone = map.getShape("spawn-point");
   * if (spawnZone) {
   *   console.log(`Spawn zone at (${spawnZone.x}, ${spawnZone.y})`);
   * }
   * ```
   */
  getShape(name: string): RpgShape | undefined {
    return this._shapes.get(name);
  }

  /**
   * Play a sound for all players on the map
   * 
   * This method plays a sound for all players currently on the map by iterating
   * over each player and calling `player.playSound()`. The sound must be defined
   * on the client side (in the client module configuration).
   * This is ideal for environmental sounds, battle music, or map-wide events that
   * all players should hear simultaneously.
   * 
   * ## Design
   * 
   * Iterates over all players on the map and calls `player.playSound()` for each one.
   * This avoids code duplication and reuses the existing player sound logic.
   * For player-specific sounds, use `player.playSound()` directly.
   * 
   * @param soundId - Sound identifier, defined on the client side
   * @param options - Optional sound configuration
   * @param options.volume - Volume level (0.0 to 1.0, default: 1.0)
   * @param options.loop - Whether the sound should loop (default: false)
   * 
   * @example
   * ```ts
   * // Play a sound for all players on the map
   * map.playSound("explosion");
   * 
   * // Play background music for everyone with volume and loop
   * map.playSound("battle-theme", {
   *   volume: 0.7,
   *   loop: true
   * });
   * 
   * // Play a door opening sound at low volume
   * map.playSound("door-open", { volume: 0.4 });
   * ```
   */
  playSound(soundId: string, options?: { volume?: number; loop?: boolean }): void {
    const players = this.getPlayers();
    players.forEach((player) => {
      player.playSound(soundId, options);
    });
  }

  /**
   * Stop a sound for all players on the map
   * 
   * This method stops a sound that was previously started with `map.playSound()`
   * for all players on the map by iterating over each player and calling `player.stopSound()`.
   * 
   * @param soundId - Sound identifier to stop
   * 
   * @example
   * ```ts
   * // Start background music for everyone
   * map.playSound("battle-theme", { loop: true });
   * 
   * // Later, stop it for everyone
   * map.stopSound("battle-theme");
   * ```
   */
  stopSound(soundId: string): void {
    const players = this.getPlayers();
    players.forEach((player) => {
      player.stopSound(soundId);
    });
  }
}

export interface RpgMap {
  $send: (conn: MockConnection, data: any) => void;
  $broadcast: (data: any) => void;
  $sessionTransfer: (userOrPublicId: any | string, targetRoomId: string) => void;
}