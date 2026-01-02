import { Action, MockConnection, Request, Room, RoomMethods, RoomOnJoin } from "@signe/room";
import { Hooks, IceMovement, ModulesToken, ProjectileMovement, ProjectileType, RpgCommonMap, Direction, RpgCommonPlayer, RpgShape, findModules } from "@rpgjs/common";
import { WorldMapsManager, type WorldMapConfig } from "@rpgjs/common";
import { RpgPlayer, RpgEvent } from "../Player/Player";
import { generateShortUUID, sync, type, users } from "@signe/sync";
import { signal } from "@signe/reactive";
import { inject } from "@signe/di";
import { context } from "../core/context";;
import { finalize, lastValueFrom, throttleTime } from "rxjs";
import { Subject } from "rxjs";
import { BehaviorSubject } from "rxjs";
import { COEFFICIENT_ELEMENTS, DAMAGE_CRITICAL, DAMAGE_PHYSIC, DAMAGE_SKILL } from "../presets";
import { z } from "zod";
import { EntityState } from "@rpgjs/physic";
import { MapOptions } from "../decorators/map";
import { BaseRoom } from "./BaseRoom";

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
  /** Called when a player is detected entering a shape */
  onDetectInShape?: (player: RpgPlayer, shape: RpgShape) => void;
  /** Called when a player is detected exiting a shape */
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
  /** 
   * Synchronized signal containing all players currently on the map
   * 
   * This signal is automatically synchronized with clients using @signe/sync.
   * Players are indexed by their unique ID.
   * 
   * @example
   * ```ts
   * // Get all players
   * const allPlayers = map.players();
   * 
   * // Get a specific player
   * const player = map.players()['player-id'];
   * ```
   */
  @users(RpgPlayer) players = signal({});

  /** 
   * Synchronized signal containing all events (NPCs, objects) on the map
   * 
   * This signal is automatically synchronized with clients using @signe/sync.
   * Events are indexed by their unique ID.
   * 
   * @example
   * ```ts
   * // Get all events
   * const allEvents = map.events();
   * 
   * // Get a specific event
   * const event = map.events()['event-id'];
   * ```
   */
  @sync(RpgPlayer) events = signal({});

  /** 
   * Signal containing the map's database of items, classes, and other game data
   * 
   * This database can be dynamically populated using `addInDatabase()` and
   * `removeInDatabase()` methods. It's used to store game entities like items,
   * classes, skills, etc. that are specific to this map.
   * 
   * @example
   * ```ts
   * // Add data to database
   * map.addInDatabase('Potion', PotionClass);
   * 
   * // Access database
   * const potion = map.database()['Potion'];
   * ```
   */
  database = signal({});

  /** 
   * Array of map configurations - can contain MapOptions objects or instances of map classes
   * 
   * This array stores the configuration for this map and any related maps.
   * It's populated when the map is loaded via `updateMap()`.
   */
  maps: (MapOptions | any)[] = []

  /** 
   * Array of sound IDs to play when players join the map
   * 
   * These sounds are automatically played for each player when they join the map.
   * Sounds must be defined on the client side.
   * 
   * @example
   * ```ts
   * // Set sounds for the map
   * map.sounds = ['background-music', 'ambient-forest'];
   * ```
   */
  sounds: string[] = []

  /** 
   * BehaviorSubject that completes when the map data is ready
   * 
   * This subject is used to signal when the map has finished loading all its data.
   * Players wait for this to complete before the map is fully initialized.
   * 
   * @example
   * ```ts
   * // Wait for map data to be ready
   * map.dataIsReady$.subscribe(() => {
   *   console.log('Map is ready!');
   * });
   * ```
   */
  dataIsReady$ = new BehaviorSubject<void>(undefined);

  /** 
   * Global configuration object for the map
   * 
   * This object contains configuration settings that apply to the entire map.
   * It's populated from the map data when `updateMap()` is called.
   */
  globalConfig: any = {}

  /** 
   * Damage formulas configuration for the map
   * 
   * Contains formulas for calculating damage from skills, physical attacks,
   * critical hits, and element coefficients. Default formulas are merged
   * with custom formulas when the map is loaded.
   */
  damageFormulas: any = {}
  /** Internal: Map of shapes by name */
  private _shapes: Map<string, RpgShape> = new Map();
  /** Internal: Map of shape entity UUIDs to RpgShape instances */
  private _shapeEntities: Map<string, RpgShape> = new Map();
  /** Internal: Subscription for the input processing loop */
  private _inputLoopSubscription?: any;
  /** Enable/disable automatic tick processing (useful for unit tests) */
  private _autoTickEnabled: boolean = true;

  autoSync: boolean = true;

  constructor(room) {
    super();
    this.hooks.callHooks("server-map-onStart", this).subscribe();
    const isTest = room.env.TEST === 'true' ? true : false;
    if (isTest) {
      this.autoSync = false;
      this.setAutoTick(false);
      this.autoTickEnabled = false;
      this.throttleSync = 0;
      this.throttleStorage = 0;
    }
    else {
      this.throttleSync = this.isStandalone ? 1 : 50
      this.throttleStorage = this.isStandalone ? 1 : 50
    };
    this.sessionExpiryTime = 1000 * 60 * 5;
    this.setupCollisionDetection();
    if (this._autoTickEnabled) {
      this.loop();
    }
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

    // Helper function to check if entities have different z (height)
    const hasDifferentZ = (entityA: any, entityB: any): boolean => {
      const zA = entityA.owner.z();
      const zB = entityB.owner.z();
      return zA !== zB;
    };

    // Listen to collision enter events
    this.physic.getEvents().onCollisionEnter((collision) => {
      const entityA = collision.entityA;
      const entityB = collision.entityB;

      // Skip collision callbacks if entities have different z (height)
      // Higher z entities should not trigger collision callbacks with lower z entities
      if (hasDifferentZ(entityA, entityB)) {
        return;
      }

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

      // Skip collision callbacks if entities have different z (height)
      if (hasDifferentZ(entityA, entityB)) {
        return;
      }

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

  /**
   * Intercepts and modifies packets before they are sent to clients
   * 
   * This method is automatically called by @signe/room for each packet sent to clients.
   * It adds timestamp and acknowledgment information to sync packets for client-side
   * prediction reconciliation. This helps with network synchronization and reduces
   * perceived latency.
   * 
   * ## Architecture
   * 
   * Adds metadata to packets:
   * - `timestamp`: Current server time for client-side prediction
   * - `ack`: Acknowledgment info with last processed frame and authoritative position
   * 
   * @param player - The player receiving the packet
   * @param packet - The packet data to intercept
   * @param conn - The connection object
   * @returns Modified packet with timestamp and ack info, or null if player is invalid
   * 
   * @example
   * ```ts
   * // This method is called automatically by the framework
   * // You typically don't call it directly
   * ```
   */
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

  /**
   * Called when a player joins the map
   * 
   * This method is automatically called by @signe/room when a player connects to the map.
   * It initializes the player's connection, sets up the map context, and waits for
   * the map data to be ready before playing sounds and triggering hooks.
   * 
   * ## Architecture
   * 
   * 1. Sets player's map reference and context
   * 2. Initializes the player
   * 3. Waits for map data to be ready
   * 4. Plays map sounds for the player
   * 5. Triggers `server-player-onJoinMap` hook
   * 
   * @param player - The player joining the map
   * @param conn - The connection object for the player
   * 
   * @example
   * ```ts
   * // This method is called automatically by the framework
   * // You can listen to the hook to perform custom logic
   * server.addHook('server-player-onJoinMap', (player, map) => {
   *   console.log(`Player ${player.id} joined map ${map.id}`);
   * });
   * ```
   */
  onJoin(player: RpgPlayer, conn: MockConnection) {
    if (player.setMap) {
      player.setMap(this);
    } else {
      player.map = this;
    }
    player.context = context;
    player.conn = conn;
    player._onInit()
    this.dataIsReady$.pipe(
      finalize(async () => {
        // Check if we should stop all sounds before playing new ones
        if ((this as any).stopAllSoundsBeforeJoin) {
          player.stopAllSounds();
        }

        this.sounds.forEach(sound => player.playSound(sound, { loop: true }));

        // Execute global map hooks (from RpgServer.map)
        await lastValueFrom(this.hooks.callHooks("server-map-onJoin", player, this));

        // // Execute map-specific hooks (from @MapData or MapOptions)
        if (typeof (this as any)._onJoin === 'function') {
          await (this as any)._onJoin(player);
        }

        // Execute player hooks
        await lastValueFrom(this.hooks.callHooks("server-player-onJoinMap", player, this));
      })
    ).subscribe();
  }

  /**
   * Called when a player leaves the map
   * 
   * This method is automatically called by @signe/room when a player disconnects from the map.
   * It cleans up the player's pending inputs and triggers the appropriate hooks.
   * 
   * ## Architecture
   * 
   * 1. Triggers `server-player-onLeaveMap` hook
   * 2. Clears pending inputs to prevent processing after disconnection
   * 
   * @param player - The player leaving the map
   * @param conn - The connection object for the player
   * 
   * @example
   * ```ts
   * // This method is called automatically by the framework
   * // You can listen to the hook to perform custom cleanup
   * server.addHook('server-player-onLeaveMap', (player, map) => {
   *   console.log(`Player ${player.id} left map ${map.id}`);
   * });
   * ```
   */
  async onLeave(player: RpgPlayer, conn: MockConnection) {
    // Execute global map hooks (from RpgServer.map)
    await lastValueFrom(this.hooks.callHooks("server-map-onLeave", player, this));

    // Execute map-specific hooks (from @MapData or MapOptions)
    if (typeof (this as any)._onLeave === 'function') {
      await (this as any)._onLeave(player);
    }

    // Execute player hooks
    await lastValueFrom(this.hooks.callHooks("server-player-onLeaveMap", player, this));
    player.pendingInputs = [];
  }

  /**
   * Get the hooks system for this map
   * 
   * Returns the dependency-injected Hooks instance that allows you to trigger
   * and listen to various game events.
   * 
   * @returns The Hooks instance for this map
   * 
   * @example
   * ```ts
   * // Trigger a custom hook
   * map.hooks.callHooks('custom-event', data).subscribe();
   * ```
   */
  get hooks() {
    return inject<Hooks>(context, ModulesToken);
  }

  /**
   * Handle GUI interaction from a player
   * 
   * This method is called when a player interacts with a GUI element.
   * It synchronizes the player's changes to ensure the client state is up to date.
   * 
   * @param player - The player performing the interaction
   * @param value - The interaction data from the client
   * 
   * @example
   * ```ts
   * // This method is called automatically when a player interacts with a GUI
   * // The interaction data is sent from the client
   * ```
   */
  @Action('gui.interaction')
  async guiInteraction(player: RpgPlayer, value: { guiId: string, name: string, data: any }) {
    const gui = player.getGui(value.guiId)
    if (gui) {
      await gui.emit(value.name, value.data)
    }
    player.syncChanges();
  }

  /**
   * Handle GUI exit from a player
   * 
   * This method is called when a player closes or exits a GUI.
   * It removes the GUI from the player's active GUIs.
   * 
   * @param player - The player exiting the GUI
   * @param guiId - The ID of the GUI being exited
   * @param data - Optional data associated with the GUI exit
   * 
   * @example
   * ```ts
   * // This method is called automatically when a player closes a GUI
   * // The GUI is removed from the player's active GUIs
   * ```
   */
  @Action('gui.exit')
  guiExit(player: RpgPlayer, { guiId, data }) {
    player.removeGui(guiId, data)
  }

  /**
   * Handle action input from a player
   * 
   * This method is called when a player performs an action (like pressing a button).
   * It checks for collisions with events and triggers the appropriate hooks.
   * 
   * ## Architecture
   * 
   * 1. Gets all entities colliding with the player
   * 2. Triggers `onAction` hook on colliding events
   * 3. Triggers `onInput` hook on the player
   * 
   * @param player - The player performing the action
   * @param action - The action data (button pressed, etc.)
   * 
   * @example
   * ```ts
   * // This method is called automatically when a player presses an action button
   * // Events near the player will have their onAction hook triggered
   * ```
   */
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

  /**
   * Handle movement input from a player
   * 
   * This method is called when a player sends movement input from the client.
   * It queues the input for processing by the game loop. Inputs are processed
   * with frame numbers to ensure proper ordering and client-side prediction.
   * 
   * ## Architecture
   * 
   * - Inputs are queued in `player.pendingInputs`
   * - Duplicate frames are skipped to prevent processing the same input twice
   * - Inputs are processed asynchronously by the game loop
   * 
   * @param player - The player sending the movement input
   * @param input - The input data containing frame number, input direction, and timestamp
   * 
   * @example
   * ```ts
   * // This method is called automatically when a player moves
   * // The input is queued and processed by processInput()
   * ```
   */
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
   * Update the map configuration and data
   * 
   * This endpoint receives map data from the client and initializes the map.
   * It loads the map configuration, damage formulas, events, and physics.
   * 
   * ## Architecture
   * 
   * 1. Validates the request body using MapUpdateSchema
   * 2. Updates map data, global config, and damage formulas
   * 3. Merges events and sounds from map configuration
   * 4. Triggers hooks for map loading
   * 5. Loads physics engine
   * 6. Creates all events on the map
   * 7. Completes the dataIsReady$ subject
   * 
   * @param request - HTTP request containing map data
   * @returns Promise that resolves when the map is fully loaded
   * 
   * @example
   * ```ts
   * // This endpoint is called automatically when a map is loaded
   * // POST /map/update
   * // Body: { id: string, width: number, height: number, config?: any, damageFormulas?: any }
   * ```
   */
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
    await lastValueFrom(this.hooks.callHooks("server-databaseHooks-load", this))

    map.events = map.events ?? []

    if (map.id) {
      const mapFound = this.maps.find(m => m.id === map.id)
      if (mapFound?.events) {
        map.events = [
          ...mapFound.events,
          ...map.events
        ]
      }
      if (mapFound?.sounds) {
        this.sounds = [
          ...(map.sounds ?? []),
          ...mapFound.sounds
        ]
      }
      else {
        this.sounds = map.sounds ?? []
      }

      // Attach map-specific hooks from MapOptions or @MapData
      if (mapFound?.onLoad) {
        (this as any)._onLoad = mapFound.onLoad;
      }
      if (mapFound?.onJoin) {
        (this as any)._onJoin = mapFound.onJoin;
      }
      if (mapFound?.onLeave) {
        (this as any)._onLeave = mapFound.onLeave;
      }
      if (mapFound?.stopAllSoundsBeforeJoin !== undefined) {
        (this as any).stopAllSoundsBeforeJoin = mapFound.stopAllSoundsBeforeJoin;
      }
    }

    await lastValueFrom(this.hooks.callHooks("server-map-onBeforeUpdate", map, this))

    this.loadPhysic()

    for (let event of map.events ?? []) {
      await this.createDynamicEvent(event);
    }

    this.dataIsReady$.complete()

    // Execute global map hooks (from RpgServer.map)
    await lastValueFrom(this.hooks.callHooks("server-map-onLoad", this))

    // Execute map-specific hooks (from @MapData or MapOptions)
    if (typeof (this as any)._onLoad === 'function') {
      await (this as any)._onLoad();
    }

    // TODO: Update map
  }

  /**
   * Update (or create) a world configuration and propagate to all maps in that world
   * 
   * This endpoint receives world map configuration data (typically from Tiled world import)
   * and creates or updates the world manager. The world ID is extracted from the URL path.
   * 
   * ## Architecture
   * 
   * 1. Extracts world ID from URL path parameter
   * 2. Normalizes input to array of WorldMapConfig
   * 3. Ensures all required map properties are present (width, height, tile sizes)
   * 4. Creates or updates the world manager
   * 
   * Expected payload examples:
   * - `{ id: string, maps: WorldMapConfig[] }`
   * - `WorldMapConfig[]`
   * 
   * @param request - HTTP request containing world configuration
   * @returns Promise resolving to `{ ok: true }` when complete
   * 
   * @example
   * ```ts
   * // POST /world/my-world/update
   * // Body: [{ id: 'map1', worldX: 0, worldY: 0, width: 800, height: 600 }]
   * 
   * // Or with nested structure
   * // Body: { id: 'my-world', maps: [{ id: 'map1', ... }] }
   * ```
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

  /**
   * Main game loop that processes player inputs
   * 
   * This private method subscribes to tick$ and processes pending inputs
   * for all players on the map with a throttle of 50ms. It ensures inputs are
   * processed in order and prevents concurrent processing for the same player.
   * 
   * ## Architecture
   * 
   * - Subscribes to tick$ with throttleTime(50ms) for responsive input processing
   * - Processes inputs for each player with pending inputs
   * - Uses a flag to prevent concurrent processing for the same player
   * - Calls `processInput()` to handle anti-cheat validation and movement
   * 
   * @example
   * ```ts
   * // This method is called automatically in the constructor if autoTick is enabled
   * // You typically don't call it directly
   * ```
   */
  private loop() {
    if (this._inputLoopSubscription) {
      this._inputLoopSubscription.unsubscribe();
    }

    this._inputLoopSubscription = this.tick$.pipe(
      throttleTime(50) // Throttle to 50ms for input processing
    ).subscribe(async ({ timestamp }) => {
      for (const player of this.getPlayers()) {
        if (player.pendingInputs.length > 0) {
          const anyPlayer = player as any;
          if (!anyPlayer._isProcessingInputs) {
            anyPlayer._isProcessingInputs = true;
            await this.processInput(player.id).finally(() => {
              anyPlayer._isProcessingInputs = false;
            });
          }
        }
      }
    });
  }

  /**
   * Enable or disable automatic tick processing
   * 
   * When disabled, the input processing loop will not run automatically.
   * This is useful for unit tests where you want manual control over when
   * inputs are processed.
   * 
   * @param enabled - Whether to enable automatic tick processing (default: true)
   * 
   * @example
   * ```ts
   * // Disable auto tick for testing
   * map.setAutoTick(false);
   * 
   * // Manually trigger tick processing
   * await map.processInput('player1');
   * ```
   */
  setAutoTick(enabled: boolean): void {
    this._autoTickEnabled = enabled;
    if (enabled && !this._inputLoopSubscription) {
      this.loop();
    } else if (!enabled && this._inputLoopSubscription) {
      this._inputLoopSubscription.unsubscribe();
      this._inputLoopSubscription = undefined;
    }
  }

  /**
   * Get a world manager by id
   * 
   * Returns the world maps manager for the given world ID. Currently, only
   * one world manager is supported per map instance.
   * 
   * @param id - The world ID (currently unused, returns the single manager)
   * @returns The WorldMapsManager instance, or null if not initialized
   * 
   * @example
   * ```ts
   * const worldManager = map.getWorldMaps('my-world');
   * if (worldManager) {
   *   const mapInfo = worldManager.getMapInfo('map1');
   * }
   * ```
   */
  getWorldMaps(id: string): WorldMapsManager | null {
    if (!this.worldMapsManager) return null;
    return this.worldMapsManager;
  }

  /**
   * Delete a world manager by id
   * 
   * Removes the world maps manager from this map instance. Currently, only
   * one world manager is supported, so this clears the single manager.
   * 
   * @param id - The world ID (currently unused)
   * @returns true if the manager was deleted, false if it didn't exist
   * 
   * @example
   * ```ts
   * const deleted = map.deleteWorldMaps('my-world');
   * if (deleted) {
   *   console.log('World manager removed');
   * }
   * ```
   */
  deleteWorldMaps(id: string): boolean {
    if (!this.worldMapsManager) return false;
    // For now, clear the single manager
    this.worldMapsManager = undefined;
    return true;
  }

  /**
   * Create a world manager dynamically
   * 
   * Creates a new WorldMapsManager instance and configures it with the provided
   * map configurations. This is used when loading world data from Tiled or
   * other map editors.
   * 
   * @param world - World configuration object
   * @param world.id - Optional world identifier
   * @param world.maps - Array of map configurations for the world
   * @returns The newly created WorldMapsManager instance
   * 
   * @example
   * ```ts
   * const manager = map.createDynamicWorldMaps({
   *   id: 'my-world',
   *   maps: [
   *     { id: 'map1', worldX: 0, worldY: 0, width: 800, height: 600 },
   *     { id: 'map2', worldX: 800, worldY: 0, width: 800, height: 600 }
   *   ]
   * });
   * ```
   */
  createDynamicWorldMaps(world: { id?: string; maps: WorldMapConfig[] }): WorldMapsManager {
    const manager = new WorldMapsManager();
    manager.configure(world.maps);
    this.worldMapsManager = manager;
    return manager;
  }

  /**
   * Update world maps by id. Auto-create when missing.
   * 
   * Updates the world maps configuration. If the world manager doesn't exist,
   * it is automatically created. This is useful for dynamically loading world
   * data or updating map positions.
   * 
   * @param id - The world ID
   * @param maps - Array of map configurations to update
   * @returns Promise that resolves when the update is complete
   * 
   * @example
   * ```ts
   * await map.updateWorldMaps('my-world', [
   *   { id: 'map1', worldX: 0, worldY: 0, width: 800, height: 600 },
   *   { id: 'map2', worldX: 800, worldY: 0, width: 800, height: 600 }
   * ]);
   * ```
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
   * This method delegates to BaseRoom's implementation to avoid code duplication.
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
    return BaseRoom.prototype.addInDatabase.call(this, id, data, options);
  }

  /**
   * Remove data from the map's database
   * 
   * This method delegates to BaseRoom's implementation to avoid code duplication.
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
    return BaseRoom.prototype.removeInDatabase.call(this, id);
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

    await eventInstance.teleport({ x, y });

    this.events()[id] = eventInstance;

    await eventInstance.execMethod('onInit')
  }

  /**
   * Get an event by its ID
   * 
   * Returns the event with the specified ID, or undefined if not found.
   * The return type can be narrowed using TypeScript generics.
   * 
   * @param eventId - The unique identifier of the event
   * @returns The event instance, or undefined if not found
   * 
   * @example
   * ```ts
   * // Get any event
   * const event = map.getEvent('npc-1');
   * 
   * // Get event with type narrowing
   * const npc = map.getEvent<MyNPC>('npc-1');
   * if (npc) {
   *   npc.speak('Hello!');
   * }
   * ```
   */
  getEvent<T extends RpgPlayer>(eventId: string): T | undefined {
    return this.events()[eventId] as T
  }

  /**
   * Get a player by their ID
   * 
   * Returns the player with the specified ID, or undefined if not found.
   * 
   * @param playerId - The unique identifier of the player
   * @returns The player instance, or undefined if not found
   * 
   * @example
   * ```ts
   * const player = map.getPlayer('player-123');
   * if (player) {
   *   console.log(`Player ${player.name} is on the map`);
   * }
   * ```
   */
  getPlayer(playerId: string): RpgPlayer | undefined {
    return this.players()[playerId]
  }

  /**
   * Get all players currently on the map
   * 
   * Returns an array of all players that are currently connected to this map.
   * 
   * @returns Array of all RpgPlayer instances on the map
   * 
   * @example
   * ```ts
   * const players = map.getPlayers();
   * console.log(`There are ${players.length} players on the map`);
   * 
   * players.forEach(player => {
   *   console.log(`- ${player.name}`);
   * });
   * ```
   */
  getPlayers(): RpgPlayer[] {
    return Object.values(this.players())
  }

  /**
   * Get all events on the map
   * 
   * Returns an array of all events (NPCs, objects, etc.) that are currently
   * on this map.
   * 
   * @returns Array of all RpgEvent instances on the map
   * 
   * @example
   * ```ts
   * const events = map.getEvents();
   * console.log(`There are ${events.length} events on the map`);
   * 
   * events.forEach(event => {
   *   console.log(`- ${event.name} at (${event.x}, ${event.y})`);
   * });
   * ```
   */
  getEvents(): RpgEvent[] {
    return Object.values(this.events())
  }

  /**
   * Get the first event that matches a condition
   * 
   * Searches through all events on the map and returns the first one that
   * matches the provided callback function.
   * 
   * @param cb - Callback function that returns true for the desired event
   * @returns The first matching event, or undefined if none found
   * 
   * @example
   * ```ts
   * // Find an event by name
   * const npc = map.getEventBy(event => event.name === 'Merchant');
   * 
   * // Find an event at a specific position
   * const chest = map.getEventBy(event => 
   *   event.x === 100 && event.y === 200
   * );
   * ```
   */
  getEventBy(cb: (event: RpgEvent) => boolean): RpgEvent | undefined {
    return this.getEventsBy(cb)[0]
  }

  /**
   * Get all events that match a condition
   * 
   * Searches through all events on the map and returns all events that
   * match the provided callback function.
   * 
   * @param cb - Callback function that returns true for desired events
   * @returns Array of all matching events
   * 
   * @example
   * ```ts
   * // Find all NPCs
   * const npcs = map.getEventsBy(event => event.name.startsWith('NPC-'));
   * 
   * // Find all events in a specific area
   * const nearbyEvents = map.getEventsBy(event => 
   *   event.x >= 0 && event.x <= 100 &&
   *   event.y >= 0 && event.y <= 100
   * );
   * ```
   */
  getEventsBy(cb: (event: RpgEvent) => boolean): RpgEvent[] {
    return this.getEvents().filter(cb)
  }

  /**
   * Remove an event from the map
   * 
   * Removes the event with the specified ID from the map. The event will
   * be removed from the synchronized events signal, causing it to disappear
   * on all clients.
   * 
   * @param eventId - The unique identifier of the event to remove
   * 
   * @example
   * ```ts
   * // Remove an event
   * map.removeEvent('npc-1');
   * 
   * // Remove event after interaction
   * const chest = map.getEvent('chest-1');
   * if (chest) {
   *   // ... do something with chest ...
   *   map.removeEvent('chest-1');
   * }
   * ```
   */
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
   * Configure runtime synchronized properties on the map
   * 
   * This method allows you to dynamically add synchronized properties to the map
   * that will be automatically synced with clients. The schema follows the same
   * structure as module properties with `$initial`, `$syncWithClient`, and `$permanent` options.
   * 
   * ## Architecture
   * 
   * - Reads a schema object shaped like module props
   * - Creates typed sync signals with @signe/sync
   * - Properties are accessible as `map.propertyName`
   * 
   * @param schema - Schema object defining the properties to sync
   * @param schema[key].$initial - Initial value for the property
   * @param schema[key].$syncWithClient - Whether to sync this property to clients
   * @param schema[key].$permanent - Whether to persist this property
   * 
   * @example
   * ```ts
   * // Add synchronized properties to the map
   * map.setSync({
   *   weather: {
   *     $initial: 'sunny',
   *     $syncWithClient: true,
   *     $permanent: false
   *   },
   *   timeOfDay: {
   *     $initial: 12,
   *     $syncWithClient: true,
   *     $permanent: false
   *   }
   * });
   * 
   * // Use the properties
   * map.weather.set('rainy');
   * const currentWeather = map.weather();
   * ```
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
   * Apply sync to the client
   * 
   * This method applies sync to the client by calling the `$applySync()` method.
   * 
   * @example
   * ```ts
   * map.applySyncToClient();
   * ```
   */
  applySyncToClient() {
    this.$applySync();
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

  /**
   * Shake the map for all players
   * 
   * This method triggers a shake animation on the map for all players currently on the map.
   * The shake effect creates a visual feedback that can be used for earthquakes, explosions,
   * impacts, or any dramatic event that should affect the entire map visually.
   * 
   * ## Architecture
   * 
   * Broadcasts a shake event to all clients connected to the map. Each client receives
   * the shake configuration and triggers the shake animation on the map container using
   * Canvas Engine's shake directive.
   * 
   * @param options - Optional shake configuration
   * @param options.intensity - Shake intensity in pixels (default: 10)
   * @param options.duration - Duration of the shake animation in milliseconds (default: 500)
   * @param options.frequency - Number of shake oscillations during the animation (default: 10)
   * @param options.direction - Direction of the shake - 'x', 'y', or 'both' (default: 'both')
   * 
   * @example
   * ```ts
   * // Basic shake with default settings
   * map.shakeMap();
   * 
   * // Intense earthquake effect
   * map.shakeMap({
   *   intensity: 25,
   *   duration: 1000,
   *   frequency: 15,
   *   direction: 'both'
   * });
   * 
   * // Horizontal shake for side impact
   * map.shakeMap({
   *   intensity: 15,
   *   duration: 400,
   *   direction: 'x'
   * });
   * 
   * // Vertical shake for ground impact
   * map.shakeMap({
   *   intensity: 20,
   *   duration: 600,
   *   direction: 'y'
   * });
   * ```
   */
  shakeMap(options?: {
    intensity?: number;
    duration?: number;
    frequency?: number;
    direction?: 'x' | 'y' | 'both';
  }): void {
    this.$broadcast({
      type: "shakeMap",
      value: {
        intensity: options?.intensity ?? 10,
        duration: options?.duration ?? 500,
        frequency: options?.frequency ?? 10,
        direction: options?.direction ?? 'both',
      },
    });
  }

  /**
   * Clear all server resources and reset state
   * 
   * This method should be called to clean up all server-side resources when
   * shutting down or resetting the map. It stops the input processing loop
   * and ensures that all subscriptions are properly cleaned up.
   * 
   * ## Design
   * 
   * This method is used primarily in testing environments to ensure clean
   * state between tests. It stops the tick subscription to prevent memory leaks.
   * 
   * @example
   * ```ts
   * // In test cleanup
   * afterEach(() => {
   *   map.clear();
   * });
   * ```
   */
  clear(): void {
    try {
      // Stop input processing loop
      if (this._inputLoopSubscription) {
        this._inputLoopSubscription.unsubscribe();
        this._inputLoopSubscription = undefined;
      }
    } catch (error) {
      console.warn('Error during map cleanup:', error);
    }
  }
}

export interface RpgMap extends RoomMethods { }