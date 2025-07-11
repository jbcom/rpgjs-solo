import {
  combineMixins,
  Hooks,
  ModulesToken,
  RpgCommonPlayer,
  ShowAnimationParams,
  Constructor,
} from "@rpgjs/common";
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
import { lastValueFrom } from "rxjs";
import { IEffectManager, WithEffectManager } from "./EffectManager";
import { AGI, AGI_CURVE, DEX, DEX_CURVE, INT, INT_CURVE, MAXHP, MAXHP_CURVE, MAXSP, MAXSP_CURVE, STR, STR_CURVE } from "../presets";
import { IElementManager, WithElementManager } from "./ElementManager";
import { ISkillManager, WithSkillManager } from "./SkillManager";
import { IBattleManager, WithBattleManager } from "./BattleManager";
import { IClassManager, WithClassManager } from "./ClassManager";
import { IStateManager, WithStateManager } from "./StateManager";

// Local interface for ZoneOptions to avoid import issues
interface ZoneOptions {
  x?: number;
  y?: number;
  radius: number;
  angle?: number;
  direction?: any;
  linkedTo?: string;
  limitedByWalls?: boolean;
}

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
  }
  
  _onInit() {
    this.hooks.callHooks("server-playerProps-load", this).subscribe();
  }

  get hooks() {
    return inject<Hooks>(this.context as any, ModulesToken);
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
    const room = this.getCurrentMap();
    this.emit("changeMap", {
      mapId: 'map-' + mapId,
      positions,
    });
    return true;
  }

  async teleport(positions: { x: number; y: number }) {
    if (!this.map) return false;
    // For movable objects like players, the position represents the center
    this.map.physic.updateHitbox(this.id, positions.x, positions.y);
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
      ...Object.values(events()),
    ];
    for (let event of arrayEvents) {
      if (event.onChanges) event.onChanges(this);
    }
  }

  attachShape(id: string, options: ZoneOptions) {
    const map = this.getCurrentMap();
    if (!map) return;

    const physic = map.physic;

    const zoneId = physic.addZone(id, {
      linkedTo: this.id,
      ...options,
    });

    physic.registerZoneEvents(
      id,
      (hitIds) => {
        hitIds.forEach((id) => {
          const event = map.getEvent<RpgEvent>(id);
          const player = map.getPlayer(id);
          const zone = physic.getZone(zoneId);
          if (event) {
            event.execMethod("onInShape", [zone, this]);
          }
          if (player) this.execMethod("onDetectInShape", [player, zone]);
        });
      },
      (hitIds) => {
        hitIds.forEach((id) => {
          const event = map.getEvent<RpgEvent>(id);
          const zone = physic.getZone(zoneId);
          const player = map.getPlayer(id);
          if (event) {
            event.execMethod("onOutShape", [zone, this]);
          }
          if (player) this.execMethod("onDetectOutShape", [player, zone]);
        });
      }
    );
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