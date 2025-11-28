import { Constructor } from "@rpgjs/common";
import { RpgCommonPlayer } from "@rpgjs/common";
import { ComponentInput, ComponentLayout } from "./Components";

type ComponentPosition = 'top' | 'center' | 'bottom' | 'left' | 'right';

/**
 * Component Manager Mixin
 * 
 * Provides graphic and component management capabilities to any class. This mixin allows
 * setting single or multiple graphics for player representation, enabling
 * dynamic visual changes and animation sequences. It also provides methods to
 * display UI components around the player graphic (top, bottom, center, left, right).
 * 
 * Components are stored as JSON strings for efficient synchronization.
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
 * player.setComponentsTop(Components.text('{name}'));
 * ```
 */
export function WithComponentManager<TBase extends Constructor<RpgCommonPlayer>>(Base: TBase): new (...args: ConstructorParameters<TBase>) => InstanceType<TBase> & IComponentManager {
  return class extends Base {
    setGraphic(graphic: string | string[]): void {
       if (Array.isArray(graphic)) {
         this.graphics.set(graphic);
       } else {
         this.graphics.set([graphic]);
       }
     }

    /**
     * Set components to display above the player graphic
     * 
     * Components are displayed above the player's sprite and can include
     * text, bars, shapes, or any combination. The components are synchronized
     * to all clients on the map.
     * 
     * @param layout - Component(s) to display, can be single, array, or 2D array
     * @param options - Optional layout options for positioning and sizing
     * @returns void
     * 
     * @example
     * ```ts
     * // Single text component
     * player.setComponentsTop(Components.text('{name}'));
     * 
     * // Multiple components vertically
     * player.setComponentsTop([
     *   Components.text('HP: {hp}'),
     *   Components.text('{name}')
     * ]);
     * 
     * // Table layout (columns)
     * player.setComponentsTop([
     *   [Components.text('{hp}'), Components.text('{name}')]
     * ]);
     * 
     * // With layout options
     * player.setComponentsTop([
     *   Components.text('HP: {hp}'),
     *   Components.text('{name}')
     * ], {
     *   width: 100,
     *   height: 30,
     *   marginBottom: -10
     * });
     * ```
     */
    setComponentsTop(layout: ComponentInput, options?: ComponentLayout): void {
      const normalized = this.normalizeComponents(layout);
      const data = {
        components: normalized,
        layout: options || {}
      };
      this.componentsTop.set(JSON.stringify(data));
    }

    /**
     * Set components to display below the player graphic
     * 
     * Components are displayed below the player's sprite and can include
     * text, bars, shapes, or any combination. The components are synchronized
     * to all clients on the map.
     * 
     * @param layout - Component(s) to display, can be single, array, or 2D array
     * @param options - Optional layout options for positioning and sizing
     * @returns void
     * 
     * @example
     * ```ts
     * player.setComponentsBottom(Components.shape({
     *   fill: '#ff0000',
     *   type: 'rectangle',
     *   width: 32,
     *   height: 32
     * }), {
     *   marginBottom: 16
     * });
     * ```
     */
    setComponentsBottom(layout: ComponentInput, options?: ComponentLayout): void {
      const normalized = this.normalizeComponents(layout);
      const data = {
        components: normalized,
        layout: options || {}
      };
      this.componentsBottom.set(JSON.stringify(data));
    }

    /**
     * Set components to display at the center of the player graphic
     * 
     * Components are displayed at the center of the player's sprite.
     * Be careful: if you assign, it deletes the graphics and if the lines are superimposed.
     * 
     * @param layout - Component(s) to display, can be single, array, or 2D array
     * @param options - Optional layout options for positioning and sizing
     * @returns void
     * 
     * @example
     * ```ts
     * player.setComponentsCenter([
     *   Components.text('{name}'),
     *   Components.hpBar()
     * ]);
     * ```
     */
    setComponentsCenter(layout: ComponentInput, options?: ComponentLayout): void {
      const normalized = this.normalizeComponents(layout);
      const data = {
        components: normalized,
        layout: options || {}
      };
      this.componentsCenter.set(JSON.stringify(data));
    }

    /**
     * Set components to display to the left of the player graphic
     * 
     * Components are displayed to the left of the player's sprite.
     * 
     * @param layout - Component(s) to display, can be single, array, or 2D array
     * @param options - Optional layout options for positioning and sizing
     * @returns void
     * 
     * @example
     * ```ts
     * player.setComponentsLeft([
     *   Components.text('{name}'),
     *   Components.hpBar()
     * ]);
     * ```
     */
    setComponentsLeft(layout: ComponentInput, options?: ComponentLayout): void {
      const normalized = this.normalizeComponents(layout);
      const data = {
        components: normalized,
        layout: options || {}
      };
      this.componentsLeft.set(JSON.stringify(data));
    }

    /**
     * Set components to display to the right of the player graphic
     * 
     * Components are displayed to the right of the player's sprite.
     * 
     * @param layout - Component(s) to display, can be single, array, or 2D array
     * @param options - Optional layout options for positioning and sizing
     * @returns void
     * 
     * @example
     * ```ts
     * player.setComponentsRight([
     *   Components.text('{name}'),
     *   Components.hpBar()
     * ]);
     * ```
     */
    setComponentsRight(layout: ComponentInput, options?: ComponentLayout): void {
      const normalized = this.normalizeComponents(layout);
      const data = {
        components: normalized,
        layout: options || {}
      };
      this.componentsRight.set(JSON.stringify(data));
    }

    /**
     * Remove components from a specific position
     * 
     * Deletes all components at the specified position.
     * 
     * @param position - Position of the components: 'top', 'center', 'bottom', 'left', or 'right'
     * @returns void
     * 
     * @example
     * ```ts
     * player.removeComponents('top');
     * ```
     */
    removeComponents(position: ComponentPosition): void {
      switch (position) {
        case 'top':
          this.componentsTop.set(null);
          break;
        case 'center':
          this.componentsCenter.set(null);
          break;
        case 'bottom':
          this.componentsBottom.set(null);
          break;
        case 'left':
          this.componentsLeft.set(null);
          break;
        case 'right':
          this.componentsRight.set(null);
          break;
      }
    }

    /**
     * Merge components with existing components at a specific position
     * 
     * Merges new components with existing components at the specified position.
     * 
     * @param position - Position of the components: 'top', 'center', 'bottom', 'left', or 'right'
     * @param layout - Component(s) to merge, can be single, array, or 2D array
     * @param options - Optional layout options for positioning and sizing
     * @returns void
     * 
     * @example
     * ```ts
     * // First set some components
     * player.setComponentsTop([Components.text('{name}')]);
     * 
     * // Then merge additional components
     * player.mergeComponents('top', [Components.hpBar()], {
     *   width: 100
     * });
     * ```
     */
    mergeComponents(position: ComponentPosition, layout: ComponentInput, options?: ComponentLayout): void {
      const normalized = this.normalizeComponents(layout);
      
      // Get existing components
      let existingData: any = null;
      let signal: any = null;
      
      switch (position) {
        case 'top':
          signal = this.componentsTop;
          break;
        case 'center':
          signal = this.componentsCenter;
          break;
        case 'bottom':
          signal = this.componentsBottom;
          break;
        case 'left':
          signal = this.componentsLeft;
          break;
        case 'right':
          signal = this.componentsRight;
          break;
      }
      
      const existingJson = signal();
      if (existingJson) {
        try {
          existingData = JSON.parse(existingJson);
        } catch (e) {
          existingData = null;
        }
      }
      
      // Merge components
      const existingComponents = existingData?.components || [];
      const mergedComponents = [...existingComponents, ...normalized];
      
      // Merge layout options
      const mergedLayout = {
        ...(existingData?.layout || {}),
        ...(options || {})
      };
      
      const data = {
        components: mergedComponents,
        layout: mergedLayout
      };
      
      signal.set(JSON.stringify(data));
    }

    /**
     * Normalize component input to a consistent structure
     * 
     * Converts various input formats (single component, array, 2D array)
     * into a normalized 2D array structure for consistent rendering.
     * 
     * @param components - Component input in any format
     * @returns Normalized 2D array of components
     */
    private normalizeComponents(components: ComponentInput): any[][] {
      if (!components) {
        return [];
      }

      // Single component
      if (!Array.isArray(components)) {
        return [[components]];
      }

      // Check if it's a 2D array (table layout)
      if (components.length > 0 && Array.isArray(components[0])) {
        return components as any[][];
      }

      // 1D array (vertical layout)
      return components.map(comp => [comp]);
    }
  } as unknown as any;
}

/**
 * Interface for component management capabilities
 * Defines the method signatures that will be available on the player
 */
export interface IComponentManager {
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
  setGraphic(graphic: string | string[]): void;

  /**
   * Set components to display above the player graphic
   * 
   * @param layout - Component(s) to display, can be single, array, or 2D array
   * @param options - Optional layout options for positioning and sizing
   * @returns void
   */
  setComponentsTop(layout: ComponentInput, options?: ComponentLayout): void;

  /**
   * Set components to display below the player graphic
   * 
   * @param layout - Component(s) to display, can be single, array, or 2D array
   * @param options - Optional layout options for positioning and sizing
   * @returns void
   */
  setComponentsBottom(layout: ComponentInput, options?: ComponentLayout): void;

  /**
   * Set components to display at the center of the player graphic
   * 
   * @param layout - Component(s) to display, can be single, array, or 2D array
   * @param options - Optional layout options for positioning and sizing
   * @returns void
   */
  setComponentsCenter(layout: ComponentInput, options?: ComponentLayout): void;

  /**
   * Set components to display to the left of the player graphic
   * 
   * @param layout - Component(s) to display, can be single, array, or 2D array
   * @param options - Optional layout options for positioning and sizing
   * @returns void
   */
  setComponentsLeft(layout: ComponentInput, options?: ComponentLayout): void;

  /**
   * Set components to display to the right of the player graphic
   * 
   * @param layout - Component(s) to display, can be single, array, or 2D array
   * @param options - Optional layout options for positioning and sizing
   * @returns void
   */
  setComponentsRight(layout: ComponentInput, options?: ComponentLayout): void;

  /**
   * Remove components from a specific position
   * 
   * @param position - Position of the components: 'top', 'center', 'bottom', 'left', or 'right'
   * @returns void
   */
  removeComponents(position: ComponentPosition): void;

  /**
   * Merge components with existing components at a specific position
   * 
   * @param position - Position of the components: 'top', 'center', 'bottom', 'left', or 'right'
   * @param layout - Component(s) to merge, can be single, array, or 2D array
   * @param options - Optional layout options for positioning and sizing
   * @returns void
   */
  mergeComponents(position: ComponentPosition, layout: ComponentInput, options?: ComponentLayout): void;
}
