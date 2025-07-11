import { Action, MockConnection, Request, Room, RoomOnJoin } from "@signe/room";
import { Hooks, IceMovement, ModulesToken, ProjectileMovement, ProjectileType, RpgCommonMap, ZoneData } from "@rpgjs/common";
import { RpgPlayer, RpgEvent } from "../Player/Player";
import { generateShortUUID, sync, type, users } from "@signe/sync";
import { signal } from "@signe/reactive";
import { inject } from "@signe/di";
import { context } from "../core/context";;
import { finalize, lastValueFrom } from "rxjs";
import { Subject } from "rxjs";
import { BehaviorSubject } from "rxjs";
import { COEFFICIENT_ELEMENTS, DAMAGE_CRITICAL, DAMAGE_PHYSIC, DAMAGE_SKILL } from "../presets";

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
  path: "map-{id}",
  throttleSync: 0
})
export class RpgMap extends RpgCommonMap<RpgPlayer> implements RoomOnJoin {
  @users(RpgPlayer) players = signal({});
  @sync(RpgPlayer) events = signal({});
  database = signal({});
  maps: any[] = []
  dataIsReady$ = new BehaviorSubject<void>(undefined);
  globalConfig: any = {}
  damageFormulas: any = {}

  onJoin(player: RpgPlayer, conn: MockConnection) {
    player.map = this;
    player.context = context;
    player.conn = conn;
    this.physic.addMovableHitbox(player, player.x(), player.y(), player.hitbox().w, player.hitbox().h, {}, {
      enabled: true,
      friction: 0.8,
      minVelocity: 0.5
    });
    this.physic.registerMovementEvents(player.id, () => {
      player.animationName.set('walk')
    }, () => {
      player.animationName.set('stand')
    })
    player._onInit()
    this.dataIsReady$.pipe(
      finalize(() => {
        this.hooks
          .callHooks("server-player-onJoinMap", player, this)
          .subscribe();
      })
    ).subscribe();
  }

  get hooks() {
    return inject<Hooks>(context, ModulesToken);
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
  onInput(player: RpgPlayer, input: any) {
   this.movePlayer(player, input.input)
  }

  @Request({
    path: "/map/update",
    method: "POST",
  })
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

    map.events = map.events ?? []

    if (map.id) {
     const mapFound = this.maps.find(m => m.id === map.id)
     if (mapFound.events) {
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
  setSync(schema: any) {
    for (let key in schema) {
      this[key] = type(signal(null), key, {
        syncWithClient: schema[key]?.$syncWithClient,
        persist: schema[key]?.$permanent,
      }, this)
    }
  }
}

export interface RpgMap {
  $send: (conn: MockConnection, data: any) => void; 
  $broadcast: (data: any) => void;
  $sessionTransfer: (userOrPublicId: any | string, targetRoomId: string) => void;
}