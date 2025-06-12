import { type Constructor } from "@rpgjs/common";
import { RpgCommonPlayer } from "@rpgjs/common";

/**
 * Interface defining what ComponentManager adds to a class
 */
export interface IComponentManager {
  setGraphic(graphic: string | string[]): void;
}

/**
 * Component Manager mixin
 * 
 * Adds methods to manage player graphics
 * 
 * @param Base - The base class to extend
 * @returns A new class with component management capabilities
 */
export function WithComponentManager<TBase extends Constructor<RpgCommonPlayer>>(Base: TBase) {
  return class extends Base implements IComponentManager {
    setGraphic(graphic: string | string[]) {
      if (Array.isArray(graphic)) {
        this.graphics.set(graphic);
      } else {
        this.graphics.set([graphic]);
      }
    }
  };
}
