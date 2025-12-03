import {
  combineMixins,
  Hooks,
  ModulesToken,
  RpgCommonPlayer,
  ShowAnimationParams,
  Constructor,
  Direction,
  AttachShapeOptions,
  RpgShape,
  ShapePositioning,
} from "@rpgjs/common";
import { Entity, Vector2 } from "@rpgjs/physic";
import { IComponentManager, WithComponentManager } from "./ComponentManager";
import { RpgMap } from "../rooms/map";
import { Context, inject } from "@signe/di";
import { IGuiManager, WithGuiManager } from "./GuiManager";
import { MockConnection } from "@signe/room";
import { IMoveManager, WithMoveManager } from "./MoveManager";
import { IGoldManager, WithGoldManager } from "./GoldManager";
import { WithVariableManager, type IVariableManager } from "./VariableManager";
import { createStatesSnapshot, load, sync, type } from "@signe/sync";
import { computed, signal } from "@signe/reactive";
import {
  IParameterManager,
  WithParameterManager,
} from "./ParameterManager";
import { WithItemFixture } from "./ItemFixture";
import { IItemManager, WithItemManager } from "./ItemManager";
import { bufferTime, combineLatest, debounceTime, distinctUntilChanged, filter, lastValueFrom, map, Observable, pairwise, sample, throttleTime } from "rxjs";
import { IEffectManager, WithEffectManager } from "./EffectManager";
import { AGI, AGI_CURVE, DEX, DEX_CURVE, INT, INT_CURVE, MAXHP, MAXHP_CURVE, MAXSP, MAXSP_CURVE, STR, STR_CURVE } from "../presets";
import { IElementManager, WithElementManager } from "./ElementManager";
import { ISkillManager, WithSkillManager } from "./SkillManager";
import { IBattleManager, WithBattleManager } from "./BattleManager";
import { IClassManager, WithClassManager } from "./ClassManager";
import { IStateManager, WithStateManager } from "./StateManager";

/**
 * Combines multiple RpgCommonPlayer mixins into one
 * 
 * @param mixins - Array of mixin functions that extend RpgCommonPlayer
 * @returns A single mixin function that applies all mixins
 */
function combinePlayerMixins<T extends Constructor<RpgCommonPlayer>>(
  mixins: Array<(Base: T) => any>
) {
  return (Base: T) =>
    mixins.reduce((ExtendedClass, mixin) => mixin(ExtendedClass), Base);
}

// Start with basic mixins that work
const BasicPlayerMixins = combinePlayerMixins([
  WithComponentManager,
  WithEffectManager,
  WithGuiManager,
  WithMoveManager,
  WithGoldManager,
  WithParameterManager,
  WithItemFixture,
  WithItemManager,
  WithElementManager,
  WithVariableManager,
  WithStateManager,
  WithClassManager,
  WithSkillManager,
  WithBattleManager,
]);

/**
 * RPG Player class with component management capabilities
 * 
 * Combines all player mixins to provide a complete player implementation
 * with graphics, movement, inventory, skills, and battle capabilities.
 * 
 * @example
 * ```ts
 * // Create a new player
 * const player = new RpgPlayer();
 * 
 * // Set player graphics
 * player.setGraphic("hero");
 * 
 * // Add parameters and items
 * player.addParameter("strength", { start: 10, end: 100 });
 * player.addItem(sword);
 * ```
 */
export class RpgPlayer extends BasicPlayerMixins(RpgCommonPlayer) {
  map: RpgMap | null = null;
  context?: Context;
  conn: MockConnection | null = null;
  touchSide: boolean = false; // Protection against map change loops
  
  /** Internal: Shapes attached to this player */
  private _attachedShapes: Map<string, RpgShape> = new Map();
  
  /** Internal: Shapes where this player is currently located */
  private _inShapes: Set<RpgShape> = new Set();
  /** Last processed client input timestamp for reconciliation */
  lastProcessedInputTs: number = 0;
  /** Last processed client input frame for reconciliation with server tick */
  _lastFramePositions: {
    frame: number;
    position: {
      x: number;
      y: number;
      direction: Direction;
    };
    serverTick?: number; // Server tick at which this position was computed
  } | null = null;

  frames: { x: number; y: number; ts: number }[] = [];

  @sync(RpgPlayer) events = signal<RpgEvent[]>([]);

  constructor() {
    super();
    // Use type assertion to access mixin properties
    (this as any).expCurve = {
        basis: 30,
        extra: 20,
        accelerationA: 30,
        accelerationB: 30
    };

    (this as any).addParameter(MAXHP, MAXHP_CURVE);
    (this as any).addParameter(MAXSP, MAXSP_CURVE);
    (this as any).addParameter(STR, STR_CURVE);
    (this as any).addParameter(INT, INT_CURVE);
    (this as any).addParameter(DEX, DEX_CURVE);
    (this as any).addParameter(AGI, AGI_CURVE);
    (this as any).allRecovery();

    let lastEmitted: { x: number; y: number } | null = null;
    let pendingUpdate: { x: number; y: number } | null = null;
    let updateScheduled = false;

    combineLatest([this.x.observable, this.y.observable])
      .subscribe(([x, y]) => {
        pendingUpdate = { x, y };
        
        // Schedule a synchronous update using queueMicrotask
        // This groups multiple rapid changes (x and y in the same tick) into a single frame
        if (!updateScheduled) {
          updateScheduled = true;
          queueMicrotask(() => {
            if (pendingUpdate) {
              const { x, y } = pendingUpdate;
              // Only emit if the values are different from the last emitted frame
              if (!lastEmitted || lastEmitted.x !== x || lastEmitted.y !== y) {
                this.frames = [...this.frames, {
                  x: x,
                  y: y,
                  ts: Date.now(),
                }];
                lastEmitted = { x, y };
              }
              pendingUpdate = null;
            }
            updateScheduled = false;
          });
        }
      })
  }
  
  _onInit() {
    this.hooks.callHooks("server-playerProps-load", this).subscribe();
  }

  get hooks() {
    return inject<Hooks>(this.context as any, ModulesToken);
  }

  applyFrames() {
    this._frames.set(this.frames)
    this.frames = []
  }

  async execMethod(method: string, methodData: any[] = [], target?: any) {
    let ret: any;
    if (target) {
      ret = await target[method](...methodData);
    }
    else {
      ret = await lastValueFrom(this.hooks
        .callHooks(`server-player-${method}`, target ?? this, ...methodData));
    }
    this.syncChanges()
    return ret;
  }

  /**
   * Change the map for this player
   *
   * @param mapId - The ID of the map to change to
   * @param positions - Optional positions to place the player at
   * @returns A promise that resolves when the map change is complete
   *
   * @example
   * ```ts
   * // Change player to map "town" at position {x: 10, y: 20}
   * await player.changeMap("town", {x: 10, y: 20});
   *
   * // Change player to map "dungeon" at a named position
   * await player.changeMap("dungeon", "entrance");
   * ```
   */
  async changeMap(
    mapId: string,
    positions?: { x: number; y: number; z?: number } | string
  ): Promise<any | null | boolean> {
    const realMapId = 'map-' + mapId;
    const room = this.getCurrentMap();
    
    const canChange: boolean[] = await lastValueFrom(this.hooks.callHooks("server-player-canChangeMap", this, {
      id: mapId,
    }));
    if (canChange.some(v => v === false)) return false;
    
    if (positions && typeof positions === 'object') {
      this.teleport(positions)
    }
    await room?.$sessionTransfer(this.conn, realMapId);
    this.emit("changeMap", {
      mapId: realMapId,
      positions,
    });
    return true;
  }

  /**
   * Auto change map when player touches map borders
   * 
   * This method checks if the player touches the current map borders
   * and automatically performs a change to the adjacent map if it exists.
   * 
   * @param nextPosition - The next position of the player
   * @returns Promise<boolean> - true if a map change occurred
   * 
   * @example
   * ```ts
   * // Called automatically by the movement system
   * const changed = await player.autoChangeMap({ x: newX, y: newY });
   * if (changed) {
   *   console.log('Player changed map automatically');
   * }
   * ```
   */
  async autoChangeMap(nextPosition: { x: number; y: number }, forcedDirection?: any): Promise<boolean> {
    const map = this.getCurrentMap() as RpgMap; // Cast to access extended properties
    if (!map) return false;

    const worldMaps = map.getWorldMapsManager?.();
    let ret: boolean = false;

    if (worldMaps && map) {
      const direction = forcedDirection ?? this.getDirection();
      const marginLeftRight = (map.tileWidth ?? 32) / 2;
      const marginTopDown = (map.tileHeight ?? 32) / 2;

      // Current world position of the player
      const worldPositionX = (map.worldX ?? 0) + this.x();
      const worldPositionY = (map.worldY ?? 0) + this.y();

      const changeMap = async (adjacentCoords: {x: number, y: number}, positionCalculator: (nextMapInfo: any) => {x: number, y: number}) => {
        if (this.touchSide) {
          return false;
        }
        this.touchSide = true;

        const [nextMap] = worldMaps.getAdjacentMaps(map, adjacentCoords);
        if (!nextMap) {
          this.touchSide = false;
          return false;
        }

        const id = nextMap.id as string;
        const nextMapInfo = worldMaps.getMapInfo(id);
        if (!nextMapInfo) {
          this.touchSide = false;
          return false;
        }

        const newPosition = positionCalculator(nextMapInfo);
        const success = await this.changeMap(id, newPosition);
        
        // Reset touchSide after a delay to allow the change
        setTimeout(() => {
          this.touchSide = false;
        }, 100);

        return !!success;
      };
  // Check left border
      if (nextPosition.x < marginLeftRight && direction === Direction.Left) {
        ret = await changeMap({
          x: (map.worldX ?? 0) - 1,
          y: worldPositionY
        }, nextMapInfo => ({
          x: nextMapInfo.width - (this.hitbox().w) - marginLeftRight,
          y: (map.worldY ?? 0) - (nextMapInfo.y ?? 0) + nextPosition.y
        }));
      }
      // Check right border
      else if (nextPosition.x > map.widthPx - this.hitbox().w - marginLeftRight && direction === Direction.Right) {
        ret = await changeMap({
          x: (map.worldX ?? 0) + map.widthPx + 1,
          y: worldPositionY
        }, nextMapInfo => ({
          x: marginLeftRight,
          y: (map.worldY ?? 0) - (nextMapInfo.y ?? 0) + nextPosition.y
        }));
      }
      // Check top border
      else if (nextPosition.y < marginTopDown && direction === Direction.Up) {
        ret = await changeMap({
          x: worldPositionX,
          y: (map.worldY ?? 0) - 1
        }, nextMapInfo => ({
          x: (map.worldX ?? 0) - (nextMapInfo.x ?? 0) + nextPosition.x,
          y: nextMapInfo.height - this.hitbox().h - marginTopDown
        }));
      }
      // Check bottom border
      else if (nextPosition.y > map.heightPx - this.hitbox().h - marginTopDown && direction === Direction.Down) {
        ret = await changeMap({
          x: worldPositionX,
          y: (map.worldY ?? 0) + map.heightPx + 1
        }, nextMapInfo => ({
          x: (map.worldX ?? 0) - (nextMapInfo.x ?? 0) + nextPosition.x,
          y: marginTopDown
        }));
      }
      else {
        this.touchSide = false;
      }
    }

    return ret;
  }

  async teleport(positions: { x: number; y: number }) {
    if (!this.map) return false;
    if (this.map.physic) {
      // Skip collision check for teleportation (allow teleporting through walls)
      const entity = this.map.physic.getEntityByUUID(this.id);
      if (entity) {
        this.map.physic.teleport(entity, { x: positions.x, y: positions.y });
      }
    }
    else {
      this.x.set(positions.x)
      this.y.set(positions.y)
    }
    // Wait for the frame to be added before applying frames
    // This ensures the frame is added before applyFrames() is called
    queueMicrotask(() => {
      this.applyFrames()
    })
  }

  getCurrentMap<T extends RpgMap = RpgMap>(): T | null {
    return this.map as T | null;
  }

  emit(type: string, value?: any) {
    const map = this.getCurrentMap();
    if (!map || !this.conn) return;
    map.$send(this.conn, {
      type,
      value,
    });
  }

  async save() {
    const snapshot = createStatesSnapshot(this)
    await lastValueFrom(this.hooks.callHooks("server-player-onSave", this, snapshot))
    return JSON.stringify(snapshot)
  }

  async load(snapshot: string) {
    const data = JSON.parse(snapshot)
    const dataLoaded = load(this, data)
    await lastValueFrom(this.hooks.callHooks("server-player-onLoad", this, dataLoaded))
    return dataLoaded
  }

  /**
   * Set the current animation of the player's sprite
   * 
   * This method changes the animation state of the player's current sprite.
   * It's used to trigger character animations like attack, skill, or custom movements.
   * When `nbTimes` is set to a finite number, the animation will play that many times
   * before returning to the previous animation state.
   * 
   * @param animationName - The name of the animation to play (e.g., 'attack', 'skill', 'walk')
   * @param nbTimes - Number of times to repeat the animation (default: Infinity for continuous)
   * 
   * @example
   * ```ts
   * // Set continuous walk animation
   * player.setAnimation('walk');
   * 
   * // Play attack animation 3 times then return to previous state
   * player.setAnimation('attack', 3);
   * 
   * // Play skill animation once
   * player.setAnimation('skill', 1);
   * 
   * // Set idle/stand animation
   * player.setAnimation('stand');
   * ```
   */
  setAnimation(animationName: string, nbTimes: number = Infinity) {
    const map = this.getCurrentMap();
    if (!map) return;
    if (nbTimes === Infinity) {
      this.animationName.set(animationName);
    }
    else {
      map.$broadcast({
        type: "setAnimation",
        value: {
          animationName,
          nbTimes,
          object: this.id,
        },
      });
    }
  }


  /**
   * Run the change detection cycle. Normally, as soon as a hook is called in a class, the cycle is started. But you can start it manually
   * The method calls the `onChanges` method on events and synchronizes all map data with the client.

  * @title Run Sync Changes
  * @method player.syncChanges()
  * @returns {void}
  * @memberof Player
  */
  syncChanges() {
    this._eventChanges();
  }

  databaseById(id: string) {
    const map = this.getCurrentMap();
    if (!map) return;
    const data = map.database()[id];
    if (!data)
      throw new Error(
        `The ID=${id} data is not found in the database. Add the data in the property "database"`
      );
    return data;
  }

  private _eventChanges() {
    const map = this.getCurrentMap();
    if (!map) return;
    const { events } = map;
    const arrayEvents: any[] = [
      ...Object.values(this.events()),
      ...Object.values(events?.() ?? {}),
    ];
    for (let event of arrayEvents) {
      if (event.onChanges) event.onChanges(this);
    }
  }

  /**
   * Attach a zone shape to this player using the physic zone system
   * 
   * This method creates a zone attached to the player's entity in the physics engine.
   * The zone can be circular or cone-shaped and will detect other entities (players/events)
   * entering or exiting the zone.
   * 
   * @param id - Optional zone identifier. If not provided, a unique ID will be generated
   * @param options - Zone configuration options
   * 
   * @example
   * ```ts
   * // Create a circular detection zone
   * player.attachShape("vision", {
   *   radius: 150,
   *   angle: 360,
   * });
   * 
   * // Create a cone-shaped vision zone
   * player.attachShape("vision", {
   *   radius: 200,
   *   angle: 120,
   *   direction: Direction.Right,
   *   limitedByWalls: true,
   * });
   * 
   * // Create a zone with width/height (radius calculated automatically)
   * player.attachShape({
   *   width: 100,
   *   height: 100,
   *   positioning: "center",
   * });
   * ```
   */
  attachShape(idOrOptions: string | AttachShapeOptions, options?: AttachShapeOptions): RpgShape | undefined {
    const map = this.getCurrentMap();
    if (!map) return undefined;

    // Handle overloaded signature: attachShape(options) or attachShape(id, options)
    let zoneId: string;
    let shapeOptions: AttachShapeOptions;
    
    if (typeof idOrOptions === 'string') {
      zoneId = idOrOptions;
      if (!options) {
        console.warn('attachShape: options must be provided when id is specified');
        return undefined;
      }
      shapeOptions = options;
    } else {
      zoneId = `zone-${this.id}-${Date.now()}`;
      shapeOptions = idOrOptions;
    }

    // Get player entity from physic engine
    const playerEntity = map.physic.getEntityByUUID(this.id);
    if (!playerEntity) {
      console.warn(`Player entity not found in physic engine for player ${this.id}`);
      return undefined;
    }

    // Calculate radius from width/height if not provided
    let radius: number;
    if (shapeOptions.radius !== undefined) {
      radius = shapeOptions.radius;
    } else if (shapeOptions.width && shapeOptions.height) {
      // Use the larger dimension as radius, or calculate from area
      radius = Math.max(shapeOptions.width, shapeOptions.height) / 2;
    } else {
      console.warn('attachShape: radius or width/height must be provided');
      return undefined;
    }

    // Calculate offset based on positioning
    let offset: Vector2 = new Vector2(0, 0);
    const positioning: ShapePositioning = shapeOptions.positioning || "default";
    if (shapeOptions.positioning) {
      const playerWidth = playerEntity.width || playerEntity.radius * 2 || 32;
      const playerHeight = playerEntity.height || playerEntity.radius * 2 || 32;
      
      switch (shapeOptions.positioning) {
        case 'top':
          offset = new Vector2(0, -playerHeight / 2);
          break;
        case 'bottom':
          offset = new Vector2(0, playerHeight / 2);
          break;
        case 'left':
          offset = new Vector2(-playerWidth / 2, 0);
          break;
        case 'right':
          offset = new Vector2(playerWidth / 2, 0);
          break;
        case 'center':
        default:
          offset = new Vector2(0, 0);
          break;
      }
    }

    // Get zone manager and create attached zone
    const zoneManager = map.physic.getZoneManager();
    
    // Convert direction from Direction enum to string if needed
    // Direction enum values are already strings ("up", "down", "left", "right")
    let direction: 'up' | 'down' | 'left' | 'right' = 'down';
    if (shapeOptions.direction !== undefined) {
      if (typeof shapeOptions.direction === 'string') {
        direction = shapeOptions.direction as 'up' | 'down' | 'left' | 'right';
      } else {
        // Direction enum value is already a string, just cast it
        direction = String(shapeOptions.direction) as 'up' | 'down' | 'left' | 'right';
      }
    }

    // Create zone with metadata for name and properties
    const metadata: Record<string, any> = {};
    if (shapeOptions.name) {
      metadata.name = shapeOptions.name;
    }
    if (shapeOptions.properties) {
      metadata.properties = shapeOptions.properties;
    }

    // Get initial position
    const initialX = playerEntity.position.x + offset.x;
    const initialY = playerEntity.position.y + offset.y;

    const physicZoneId = zoneManager.createAttachedZone(
      playerEntity,
      {
        radius,
        angle: shapeOptions.angle ?? 360,
        direction,
        limitedByWalls: shapeOptions.limitedByWalls ?? false,
        offset,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      },
      {
        onEnter: (entities: Entity[]) => {
          entities.forEach((entity) => {
            const event = map.getEvent<RpgEvent>(entity.uuid);
            const player = map.getPlayer(entity.uuid);
            
            if (event) {
              event.execMethod("onInShape", [shape, this]);
              // Track that this event is in the shape
              if ((event as any)._inShapes) {
                (event as any)._inShapes.add(shape);
              }
            }
            if (player) {
              this.execMethod("onDetectInShape", [player, shape]);
              // Track that this player is in the shape
              if (player._inShapes) {
                player._inShapes.add(shape);
              }
            }
          });
        },
        onExit: (entities: Entity[]) => {
          entities.forEach((entity) => {
            const event = map.getEvent<RpgEvent>(entity.uuid);
            const player = map.getPlayer(entity.uuid);
            
            if (event) {
              event.execMethod("onOutShape", [shape, this]);
              // Remove from tracking
              if ((event as any)._inShapes) {
                (event as any)._inShapes.delete(shape);
              }
            }
            if (player) {
              this.execMethod("onDetectOutShape", [player, shape]);
              // Remove from tracking
              if (player._inShapes) {
                player._inShapes.delete(shape);
              }
            }
          });
        },
      }
    );

    // Create RpgShape instance
    const shape = new RpgShape({
      name: shapeOptions.name || zoneId,
      positioning,
      width: shapeOptions.width || radius * 2,
      height: shapeOptions.height || radius * 2,
      x: initialX,
      y: initialY,
      properties: shapeOptions.properties || {},
      playerOwner: this,
      physicZoneId: physicZoneId,
      map: map,
    });

    // Store mapping from zoneId to physicZoneId for future reference
    (this as any)._zoneIdMap = (this as any)._zoneIdMap || new Map();
    (this as any)._zoneIdMap.set(zoneId, physicZoneId);
    
    // Store the shape
    this._attachedShapes.set(zoneId, shape);
    
    // Update shape position when player moves
    const updateShapePosition = () => {
      const currentEntity = map.physic.getEntityByUUID(this.id);
      if (currentEntity) {
        const zoneInfo = zoneManager.getZone(physicZoneId);
        if (zoneInfo) {
          shape._updatePosition(zoneInfo.position.x, zoneInfo.position.y);
        }
      }
    };
    
    // Listen to position changes to update shape position
    playerEntity.onPositionChange(() => {
      updateShapePosition();
    });

    return shape;
  }
  
  /**
   * Get all shapes attached to this player
   * 
   * Returns all shapes that were created using `attachShape()` on this player.
   * 
   * @returns Array of RpgShape instances attached to this player
   * 
   * @example
   * ```ts
   * player.attachShape("vision", { radius: 150 });
   * player.attachShape("detection", { radius: 100 });
   * 
   * const shapes = player.getShapes();
   * console.log(shapes.length); // 2
   * ```
   */
  getShapes(): RpgShape[] {
    return Array.from(this._attachedShapes.values());
  }
  
  /**
   * Get all shapes where this player is currently located
   * 
   * Returns all shapes (from any player/event) where this player is currently inside.
   * This is updated automatically when the player enters or exits shapes.
   * 
   * @returns Array of RpgShape instances where this player is located
   * 
   * @example
   * ```ts
   * // Another player has a detection zone
   * otherPlayer.attachShape("detection", { radius: 200 });
   * 
   * // Check if this player is in any shape
   * const inShapes = player.getInShapes();
   * if (inShapes.length > 0) {
   *   console.log("Player is being detected!");
   * }
   * ```
   */
  getInShapes(): RpgShape[] {
    return Array.from(this._inShapes);
  }

  /**
   * Show a temporary component animation on this player
   * 
   * This method broadcasts a component animation to all clients, allowing
   * temporary visual effects like hit indicators, spell effects, or status animations
   * to be displayed on the player.
   * 
   * @param id - The ID of the component animation to display
   * @param params - Parameters to pass to the component animation
   * 
   * @example
   * ```ts
   * // Show a hit animation with damage text
   * player.showComponentAnimation("hit", {
   *   text: "150",
   *   color: "red"
   * });
   * 
   * // Show a heal animation
   * player.showComponentAnimation("heal", {
   *   amount: 50
   * });
   * ```
   */
  showComponentAnimation(id: string, params: any = {}) {
    const map = this.getCurrentMap();
    if (!map) return;
    map.$broadcast({
      type: "showComponentAnimation",
      value: {
        id,
        params,
        object: this.id,
      },
    });
  }

  showHit(text: string) {
    this.showComponentAnimation("hit", {
      text,
      direction: this.direction(),
    });
  }

  /**
   * Play a sound on the client side for this player only
   * 
   * This method emits an event to play a sound only for this specific player.
   * The sound must be defined on the client side (in the client module configuration).
   * 
   * ## Design
   * 
   * The sound is sent only to this player's client connection, making it ideal
   * for personal feedback sounds like UI interactions, notifications, or personal
   * achievements. For map-wide sounds that all players should hear, use `map.playSound()` instead.
   * 
   * @param soundId - Sound identifier, defined on the client side
   * @param options - Optional sound configuration
   * @param options.volume - Volume level (0.0 to 1.0, default: 1.0)
   * @param options.loop - Whether the sound should loop (default: false)
   * 
   * @example
   * ```ts
   * // Play a sound for this player only (default behavior)
   * player.playSound("item-pickup");
   * 
   * // Play a sound with volume and loop
   * player.playSound("background-music", {
   *   volume: 0.5,
   *   loop: true
   * });
   * 
   * // Play a notification sound at low volume
   * player.playSound("notification", { volume: 0.3 });
   * ```
   */
  playSound(soundId: string, options?: { volume?: number; loop?: boolean }): void {
    const map = this.getCurrentMap();
    if (!map) return;

    const data: any = {
      soundId,
    };

    if (options) {
      if (options.volume !== undefined) {
        data.volume = Math.max(0, Math.min(1, options.volume));
      }
      if (options.loop !== undefined) {
        data.loop = options.loop;
      }
    }

    // Send only to this player
    this.emit("playSound", data);
  }

  /**
   * Stop a sound that is currently playing for this player
   * 
   * This method stops a sound that was previously started with `playSound()`.
   * The sound must be defined on the client side.
   * 
   * @param soundId - Sound identifier to stop
   * 
   * @example
   * ```ts
   * // Start a looping background music
   * player.playSound("background-music", { loop: true });
   * 
   * // Later, stop it
   * player.stopSound("background-music");
   * ```
   */
  stopSound(soundId: string): void {
    const map = this.getCurrentMap();
    if (!map) return;

    const data = {
      soundId,
    };

    // Send stop command only to this player
    this.emit("stopSound", data);
  }

  /**
   * Make the camera follow another player or event
   * 
   * This method sends an instruction to the client to fix the viewport on another sprite.
   * The camera will follow the specified player or event, with optional smooth animation.
   * 
   * ## Design
   * 
   * The camera follow instruction is sent only to this player's client connection.
   * This allows each player to have their own camera target, useful for cutscenes,
   * following NPCs, or focusing on specific events.
   * 
   * @param otherPlayer - The player or event that the camera should follow
   * @param options - Camera follow options
   * @param options.smoothMove - Enable smooth animation. Can be a boolean (default: true) or an object with animation parameters
   * @param options.smoothMove.time - Time duration for the animation in milliseconds (optional)
   * @param options.smoothMove.ease - Easing function name. Visit https://easings.net for available functions (optional)
   * 
   * @example
   * ```ts
   * // Follow another player with default smooth animation
   * player.cameraFollow(otherPlayer, { smoothMove: true });
   * 
   * // Follow an event with custom smooth animation
   * player.cameraFollow(npcEvent, {
   *   smoothMove: {
   *     time: 1000,
   *     ease: "easeInOutQuad"
   *   }
   * });
   * 
   * // Follow without animation (instant)
   * player.cameraFollow(targetPlayer, { smoothMove: false });
   * ```
   */
  cameraFollow(
    otherPlayer: RpgPlayer | RpgEvent,
    options?: {
      smoothMove?: boolean | { time?: number; ease?: string };
    }
  ): void {
    const map = this.getCurrentMap();
    if (!map) return;

    const data: any = {
      targetId: otherPlayer.id,
    };

    // Handle smoothMove option
    if (options?.smoothMove !== undefined) {
      if (typeof options.smoothMove === "boolean") {
        data.smoothMove = options.smoothMove;
      } else {
        // smoothMove is an object
        data.smoothMove = {
          enabled: true,
          ...options.smoothMove,
        };
      }
    } else {
      // Default to true if not specified
      data.smoothMove = true;
    }

    // Send camera follow instruction only to this player
    this.emit("cameraFollow", data);
  }

  /**
   * Set the sync schema for the map
   * @param schema - The schema to set
   */
  setSync(schema: any) {
    for (let key in schema) {
      this[key] = type(signal(null), key, {
        syncWithClient: schema[key]?.$syncWithClient,
        persist: schema[key]?.$permanent,
      }, this)
    }
  }
}

export class RpgEvent extends RpgPlayer {
  override async execMethod(methodName: string, methodData: any[] = [], instance = this) {
    await lastValueFrom(this.hooks
      .callHooks(`server-event-${methodName}`, instance, ...methodData));
    if (!instance[methodName]) {
      return;
    }
    const ret = instance[methodName](...methodData);
    return ret;
  }

  remove() {
    const map = this.getCurrentMap();
    if (!map) return;
    map.removeEvent(this.id);
  }
}


/**
 * Interface extension for RpgPlayer
 * 
 * Extends the RpgPlayer class with additional interfaces from mixins.
 * This provides proper TypeScript support for all mixin methods and properties.
 */
export interface RpgPlayer extends 
IVariableManager, 
IMoveManager, 
IGoldManager, 
IComponentManager, 
IGuiManager, 
IItemManager, 
IEffectManager,
IParameterManager,
IElementManager,
ISkillManager,
IBattleManager,
IClassManager,
IStateManager
 {} 