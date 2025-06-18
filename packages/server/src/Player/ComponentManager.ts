import { Constructor, PlayerCtor } from "@rpgjs/common";
import { RpgCommonPlayer } from "@rpgjs/common";

/**
 * Component Manager Mixin
 * 
 * Provides graphic management capabilities to any class. This mixin allows
 * setting single or multiple graphics for player representation, enabling
 * dynamic visual changes and animation sequences.
 * 
 * @param Base - The base class to extend with component management
 * @returns Extended class with component management methods
 * 
 * @example
 * ```ts
 * class MyPlayer extends WithComponentManager(BasePlayer) {
 *   constructor() {
 *     super();
 *     this.setGraphic("hero");
 *   }
 * }
 * 
 * const player = new MyPlayer();
 * player.setGraphic(["hero_idle", "hero_walk"]);
 * ```
 */
export function WithComponentManager<TBase extends PlayerCtor>(Base: TBase) {
  return class extends Base {
    /**
     * Set the graphic(s) for this player
     *
     * Allows setting either a single graphic or multiple graphics for the player.
     * When multiple graphics are provided, they are used for animation sequences.
     * The graphics system provides flexible visual representation that can be
     * dynamically changed during gameplay for different states, equipment, or animations.
     *
     * @param graphic - Single graphic name or array of graphic names for animation sequences
     * @returns void
     *
     * @example
     * ```ts
     * // Set a single graphic for static representation
     * player.setGraphic("hero");
     *
     * // Set multiple graphics for animation sequences
     * player.setGraphic(["hero_idle", "hero_walk", "hero_run"]);
     * 
     * // Dynamic graphic changes based on equipment
     * if (player.hasArmor('platemail')) {
     *   player.setGraphic("hero_armored");
     * }
     * 
     * // Animation sequences for different actions
     * player.setGraphic(["mage_cast_1", "mage_cast_2", "mage_cast_3"]);
     * ```
     */
         setGraphic(graphic: string | string[]): void {
       if (Array.isArray(graphic)) {
         this.graphics.set(graphic);
       } else {
         this.graphics.set([graphic]);
       }
     }
  } as unknown as TBase;
}

/**
 * Type helper to extract the interface from the WithComponentManager mixin
 * This provides the type without duplicating method signatures
 */
export type IComponentManager = InstanceType<ReturnType<typeof WithComponentManager>>;
